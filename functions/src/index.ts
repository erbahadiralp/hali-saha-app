import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";

admin.initializeApp();
const db = admin.firestore();

// Firestore lives in eur3; running functions next to it avoids cross-region latency and egress.
// Keep in sync with getFunctions(app, FUNCTIONS_REGION) in firebaseConfig.ts.
//
// maxInstances caps how many copies of a function can run at once, which puts a ceiling on the
// bill if a trigger ever misbehaves or traffic spikes unexpectedly. Ten is generous for the
// current scale; raise it before launch if real traffic starts queueing.
const regional = functions.region("europe-west1").runWith({ maxInstances: 10 });

// ============================================================
// 1. WAITLIST MANAGEMENT - When a player leaves, notify waitlist
// ============================================================
export const onMatchParticipantUpdate = regional.firestore
  .document("match_participants/{participantId}")
  .onUpdate(async (change, _context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Only trigger when status changes from IN to something else
    if (before.status === "IN" && after.status !== "IN") {
      const matchId = after.matchId;
      await notifyWaitlist(matchId);
    }

    // Stat corrections, disputes and late MVP awards on a finished match flow into the profile.
    if (STAT_FIELDS.some((field) => before[field] !== after[field])) {
      await recomputeIfMatchFinished(after.matchId, [after.userId]);
    }
  });

export const onMatchParticipantDelete = regional.firestore
  .document("match_participants/{participantId}")
  .onDelete(async (snap, _context) => {
    const data = snap.data();
    if (data.status === "IN") {
      await notifyWaitlist(data.matchId);
      await recomputeIfMatchFinished(data.matchId, [data.userId]);
    }
  });

// ============================================================
// PROFILE STATS — single writer
// ============================================================
// users/{uid}.stats (+ top-level matchesPlayed, lastMatchDate) are rebuilt from match_participants of
// finished matches instead of being incremented. Rebuilding is idempotent, so edits, disputes, deleted
// matches and repeated triggers can never double count.

const STATS_VERSION = 2;
const STAT_FIELDS = ["status", "team", "goals", "assists", "cleanSheet", "isMotm", "isMvp"];
const XP_RULES = { participation: 100, win: 100, goal: 50, assist: 30, cleanSheet: 50, mvp: 150 };

async function recomputeUserStats(userId: string): Promise<Record<string, number> | null> {
  if (!userId || userId.startsWith("guest_")) return null;
  const userRef = db.doc(`users/${userId}`);
  const userDoc = await userRef.get();
  if (!userDoc.exists) return null;

  const participations = await db
    .collection("match_participants")
    .where("userId", "==", userId)
    .where("status", "==", "IN")
    .get();

  const matchIds = [...new Set(participations.docs.map((d) => d.data().matchId).filter(Boolean))] as string[];
  const matches = new Map<string, FirebaseFirestore.DocumentData>();
  for (let i = 0; i < matchIds.length; i += 100) {
    const refs = matchIds.slice(i, i + 100).map((id) => db.doc(`matches/${id}`));
    const docs = await db.getAll(...refs);
    docs.forEach((d) => { if (d.exists) matches.set(d.id, d.data()!); });
  }

  const totals = { matchesPlayed: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, cleanSheets: 0, motmCount: 0, xp: 0 };
  let lastMatchDate: Date | null = null;

  for (const pDoc of participations.docs) {
    const p = pDoc.data();
    const m = matches.get(p.matchId);
    if (!m || m.isDeleted || m.status !== "FINISHED") continue;

    const goals = p.goals || 0;
    const assists = p.assists || 0;
    const hasScore = typeof m.scoreA === "number" && typeof m.scoreB === "number";
    const won = hasScore && ((p.team === "A" && m.scoreA > m.scoreB) || (p.team === "B" && m.scoreB > m.scoreA));
    const drawn = hasScore && m.scoreA === m.scoreB;
    const mvp = m.motm === userId || p.isMotm === true || p.isMvp === true;

    totals.matchesPlayed += 1;
    totals.goals += goals;
    totals.assists += assists;
    if (won) totals.wins += 1;
    else if (drawn) totals.draws += 1;
    else if (hasScore && p.team) totals.losses += 1;
    if (p.cleanSheet) totals.cleanSheets += 1;
    if (mvp) totals.motmCount += 1;
    totals.xp += XP_RULES.participation + (won ? XP_RULES.win : 0) + goals * XP_RULES.goal +
      assists * XP_RULES.assist + (p.cleanSheet ? XP_RULES.cleanSheet : 0) + (mvp ? XP_RULES.mvp : 0);

    const date: Date | null = m.date?.toDate?.() ?? null;
    if (date && (!lastMatchDate || date > lastMatchDate)) lastMatchDate = date;
  }

  const update: Record<string, unknown> = {
    matchesPlayed: totals.matchesPlayed,
    statsVersion: STATS_VERSION,
    statsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  for (const [key, value] of Object.entries(totals)) update[`stats.${key}`] = value;
  if (lastMatchDate) update.lastMatchDate = admin.firestore.Timestamp.fromDate(lastMatchDate);

  await userRef.update(update);
  return totals;
}

async function recomputeUsers(userIds: string[]) {
  const unique = [...new Set(userIds.filter((id) => id && !id.startsWith("guest_")))];
  await Promise.all(unique.map((id) => recomputeUserStats(id).catch((error) => {
    console.error(`Error recomputing stats for ${id}:`, error);
  })));
}

/** Recompute for the given users only when the match is (or was just) finished. */
async function recomputeIfMatchFinished(matchId: string, userIds: string[]) {
  if (!matchId) return;
  const matchDoc = await db.doc(`matches/${matchId}`).get();
  if (!matchDoc.exists || matchDoc.data()!.status !== "FINISHED") return;
  await recomputeUsers(userIds);
}

async function participantIdsOf(matchId: string): Promise<string[]> {
  const snap = await db.collection("match_participants").where("matchId", "==", matchId).get();
  return snap.docs.map((d) => d.data().userId);
}

/** Lets a signed-in user rebuild their own counters (used once to migrate legacy, double-counted data). */
export const recomputeMyStats = regional.https.onCall(async (_data, context) => {
  const uid = context.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Giriş yapmalısın.");
  const stats = await recomputeUserStats(uid);
  return { stats, statsVersion: STATS_VERSION };
});

async function notifyWaitlist(matchId: string) {
  try {
    const matchDoc = await db.doc(`matches/${matchId}`).get();
    if (!matchDoc.exists) return;

    const matchData = matchDoc.data()!;
    const maxPlayers = matchData.maxPlayers || 14;
    const currentCount = matchData.playerCount || 0;

    // Only notify if there's room now
    if (currentCount >= maxPlayers) return;

    // Get first person on waitlist (FIFO)
    const waitlistSnap = await db
      .collection("match_participants")
      .where("matchId", "==", matchId)
      .where("status", "==", "WAITLIST")
      .orderBy("updatedAt", "asc")
      .limit(1)
      .get();

    if (waitlistSnap.empty) return;

    const waiter = waitlistSnap.docs[0].data();

    // Send notification to waitlisted user
    await db.collection("notifications").add({
      userId: waiter.userId,
      title: "Kadroda Yer Açıldı!",
      body: "Beklediğin maçta bir kişi çıktı. Hemen gel ve yerini kap!",
      type: "match_waitlist",
      matchId: matchId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send push notification if user has a token
    await sendPushToUser(waiter.userId, "Kadroda Yer Açıldı!", "Beklediğin maçta bir kişi çıktı!");
  } catch (error) {
    console.error("Error notifying waitlist:", error);
  }
}

// ============================================================
// 2. MATCH REMINDERS - Schedule notifications before matches
// ============================================================
export const onMatchCreate = regional.firestore
  .document("matches/{matchId}")
  .onCreate(async (snap, context) => {
    const matchData = snap.data();
    const matchId = context.params.matchId;

    // If match belongs to a group, notify all group members
    if (matchData.groupId) {
      try {
        const groupDoc = await db.doc(`groups/${matchData.groupId}`).get();
        if (groupDoc.exists) {
          const groupData = groupDoc.data()!;
          const members: string[] = groupData.members || [];
          const groupName = groupData.name || "Grup";

          const matchDate = matchData.date?.toDate?.() || new Date(matchData.date);
          const dateStr = matchDate.toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" });
          const timeStr = matchDate.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

          const batch = db.batch();
          
          // Check vacation status for all members in parallel
          const memberVacationStatuses = await Promise.all(
            members.map(async (memberId) => {
              if (memberId === matchData.creatorId) return { memberId, isOnVacation: true }; // Skip creator anyway
              
              const vacationSnap = await db.collection("vacation_mode")
                .where("userId", "==", memberId)
                .where("isActive", "==", true)
                .limit(1)
                .get();
              return { memberId, isOnVacation: !vacationSnap.empty };
            })
          );

          for (const status of memberVacationStatuses) {
            if (!status.isOnVacation) {
              const notifRef = db.collection("notifications").doc();
              batch.set(notifRef, {
                userId: status.memberId,
                title: `${groupName} - Yeni Maç!`,
                body: `${dateStr} ${timeStr} - ${matchData.venue}`,
                type: "match_invite",
                matchId: matchId,
                groupId: matchData.groupId,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }
          }
          await batch.commit();
        }
      } catch (error) {
        console.error("Error sending match create notifications:", error);
      }
    }
  });

// Hourly task (scheduledHourly): finds matches within reminder windows
async function sendMatchReminders() {
  const now = new Date();

  // Reminder windows: 24h, 12h, 3h, 1h before match
  const reminderWindows = [
    { hours: 24, label: "24 saat" },
    { hours: 12, label: "12 saat" },
    { hours: 3, label: "3 saat" },
    { hours: 1, label: "1 saat" },
  ];

  for (const window of reminderWindows) {
    const targetTime = new Date(now.getTime() + window.hours * 60 * 60 * 1000);
    const windowStart = new Date(targetTime.getTime() - 30 * 60 * 1000); // 30 min before
    const windowEnd = new Date(targetTime.getTime() + 30 * 60 * 1000); // 30 min after

    const matchesSnap = await db
      .collection("matches")
      .where("status", "==", "UPCOMING")
      .where("date", ">=", windowStart)
      .where("date", "<=", windowEnd)
      .get();

    for (const matchDoc of matchesSnap.docs) {
      const matchData = matchDoc.data();
      const matchId = matchDoc.id;
      if (matchData.isDeleted) continue;

      // Check if reminder already sent for this window
      const reminderKey = `reminder_${window.hours}h`;
      if (matchData[reminderKey]) continue;

      // Get participants who are IN
      const participantsSnap = await db
        .collection("match_participants")
        .where("matchId", "==", matchId)
        .where("status", "==", "IN")
        .get();

      if (participantsSnap.empty) continue;

      const participantUserIds = participantsSnap.docs.map(doc => doc.data().userId).filter(Boolean);

      // Batch read user configurations
      const userDocsMap = new Map<string, any>();
      if (participantUserIds.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < participantUserIds.length; i += 30) {
          chunks.push(participantUserIds.slice(i, i + 30));
        }

        await Promise.all(
          chunks.map(async (chunk) => {
            const usersSnap = await db.collection("users")
              .where(admin.firestore.FieldPath.documentId(), "in", chunk)
              .get();
            usersSnap.docs.forEach((doc) => {
              userDocsMap.set(doc.id, doc.data());
            });
          })
        );
      }

      const batch = db.batch();

      for (const pDoc of participantsSnap.docs) {
        const pData = pDoc.data();
        const userData = userDocsMap.get(pData.userId);
        const notificationsEnabled = userData?.preferences?.notifications !== false;

        if (notificationsEnabled) {
          const notifRef = db.collection("notifications").doc();
          batch.set(notifRef, {
            userId: pData.userId,
            title: "Maç Hatırlatıcı ⚽",
            body: `Maça ${window.label} kaldı! ${matchData.venue}`,
            type: "match_reminder",
            matchId: matchId,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Send push notification
          await sendPushToUser(pData.userId, "Maç Hatırlatıcı ⚽", `Maça ${window.label} kaldı!`);
        }
      }

      // Mark reminder as sent
      batch.update(matchDoc.ref, { [reminderKey]: true });
      await batch.commit();
    }
  }
}

// ============================================================
// 3. STATS AGGREGATION - Rebuild participants' profile stats when a result changes
// ============================================================
export const onMatchStatusUpdate = regional.firestore
  .document("matches/{matchId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const matchId = context.params.matchId;

    const resultChanged =
      before.status !== after.status ||
      before.scoreA !== after.scoreA ||
      before.scoreB !== after.scoreB ||
      before.motm !== after.motm ||
      before.isDeleted !== after.isDeleted;
    const affectsStats = before.status === "FINISHED" || after.status === "FINISHED";

    // Opens the 24h stats-entry window. The hourly job only reads matches with statsClosed == false,
    // so it no longer scans every finished match ever played.
    if (before.status !== "FINISHED" && after.status === "FINISHED" && after.statsClosed === undefined) {
      await change.after.ref.update({
        statsClosed: false,
        statsOpenedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    if (!before.isDeleted && after.isDeleted) {
      await cleanupDeletedMatch(matchId);
    }

    if (resultChanged && affectsStats) {
      await recomputeUsers(await participantIdsOf(matchId));
    }
  });

/**
 * Matches are soft-deleted (isDeleted) so history and stats stay consistent. Their pending side
 * effects are closed here: match notifications, open invites, open disputes and MVP voting.
 */
async function cleanupDeletedMatch(matchId: string) {
  const [notifications, invites, disputes, session] = await Promise.all([
    db.collection("notifications").where("matchId", "==", matchId).get(),
    db.collection("invites").where("type", "==", "match").where("targetId", "==", matchId).where("status", "==", "pending").get(),
    db.collection("disputes").where("matchId", "==", matchId).where("status", "==", "open").get(),
    db.doc(`mvp_sessions/${matchId}`).get(),
  ]);

  const writer = db.bulkWriter();
  const now = admin.firestore.FieldValue.serverTimestamp();
  notifications.docs.forEach((d) => writer.delete(d.ref));
  invites.docs.forEach((d) => writer.update(d.ref, { status: "cancelled" }));
  disputes.docs.forEach((d) => writer.update(d.ref, { status: "cancelled", resolvedAt: now, resolvedBy: "system" }));
  if (session.exists && !session.data()!.isComplete) {
    writer.update(session.ref, { isComplete: true, closedAt: now });
  }
  await writer.close();
}

export const onMatchDelete = regional.firestore
  .document("matches/{matchId}")
  .onDelete(async (snap, context) => {
    if (snap.data().status !== "FINISHED") return;
    await recomputeUsers(await participantIdsOf(context.params.matchId));
  });

// ============================================================
// 3b. MVP VOTING CLOSE - Persist the winner once voting time is over
// ============================================================
// Voting (client-created mvp_sessions/{matchId}) runs until 31 minutes after the match ends. Nothing
// used to record the winner when it simply expired; this job tallies the votes and stores
// matches.motm + match_participants.isMotm, which in turn rebuilds the players' stats.
const MVP_CLOSE_AFTER_MS = 31 * 60 * 1000;

async function closeMvpSession(matchId: string) {
  const sessionRef = db.doc(`mvp_sessions/${matchId}`);
  const votes = await db.collection("mvp_votes").where("matchId", "==", matchId).get();
  const tally = new Map<string, number>();
  votes.docs.forEach((v) => {
    const chosen = v.data().secilenId;
    if (chosen) tally.set(chosen, (tally.get(chosen) || 0) + 1);
  });
  const winnerId = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const batch = db.batch();
  batch.update(sessionRef, { isComplete: true, closedAt: admin.firestore.FieldValue.serverTimestamp(), mvpId: winnerId });
  if (winnerId) {
    batch.update(db.doc(`matches/${matchId}`), { motm: winnerId });
    const winnerPart = await db
      .collection("match_participants")
      .where("matchId", "==", matchId)
      .where("userId", "==", winnerId)
      .limit(1)
      .get();
    if (!winnerPart.empty) batch.update(winnerPart.docs[0].ref, { isMotm: true });
  }
  await batch.commit();
}

async function closeExpiredMvpSessions() {
  const open = await db.collection("mvp_sessions").where("isComplete", "==", false).get();
  const now = Date.now();
  for (const sessionDoc of open.docs) {
    const matchId = sessionDoc.data().matchId || sessionDoc.id;
    const matchDoc = await db.doc(`matches/${matchId}`).get();
    if (!matchDoc.exists) continue;
    const m = matchDoc.data()!;
    if (m.isDeleted) {
      await sessionDoc.ref.update({ isComplete: true, closedAt: admin.firestore.FieldValue.serverTimestamp() });
      continue;
    }
    const end: Date | null = m.finishedAt?.toDate?.() ??
        (m.date?.toDate ? new Date(m.date.toDate().getTime() + 90 * 60 * 1000) : null);
    if (!end || now < end.getTime() + MVP_CLOSE_AFTER_MS) continue;
    try {
      await closeMvpSession(matchId);
    } catch (error) {
      console.error(`Error closing MVP session ${matchId}:`, error);
    }
  }
}

// ============================================================
// 4. NOTIFICATION TYPE VALIDATION
// ============================================================
export const onNotificationCreate = regional.firestore
  .document("notifications/{notificationId}")
  .onCreate(async (snap, _context) => {
    const data = snap.data();

    // Validate required fields
    if (!data.userId || !data.title) {
      await snap.ref.delete();
      return;
    }

    // Check user's notification preferences
    try {
      const userDoc = await db.doc(`users/${data.userId}`).get();
      if (!userDoc.exists) {
        await snap.ref.delete();
        return;
      }

      const userData = userDoc.data()!;
      const prefs = userData.preferences || {};

      // If user has notifications disabled globally, delete
      if (prefs.notifications === false) {
        await snap.ref.delete();
        return;
      }

      // Send push notification
      await sendPushToUser(data.userId, data.title, data.body || "");
    } catch (error) {
      console.error("Error processing notification:", error);
    }
  });

// ============================================================
// 5. GROUP REQUEST NOTIFICATION
// ============================================================
export const onGroupRequestCreate = regional.firestore
  .document("group_requests/{requestId}")
  .onCreate(async (snap, _context) => {
    const data = snap.data();

    try {
      const groupDoc = await db.doc(`groups/${data.groupId}`).get();
      if (!groupDoc.exists) return;

      const groupData = groupDoc.data()!;
      const admins = groupData.admins || [groupData.adminId];

      // Get requester info
      const userDoc = await db.doc(`users/${data.userId}`).get();
      const userName = userDoc.exists ? userDoc.data()?.displayName || userDoc.data()?.name || "Birisi" : "Birisi";

      const batch = db.batch();
      for (const adminId of admins) {
        const notifRef = db.collection("notifications").doc();
        batch.set(notifRef, {
          userId: adminId,
          title: `${groupData.name} - Katılma İsteği`,
          body: `${userName} grubunuza katılmak istiyor.`,
          type: "group_request",
          groupId: data.groupId,
          fromUserId: data.userId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (error) {
      console.error("Error sending group request notification:", error);
    }
  });

// ============================================================
// 6. RATE LIMITING (server-side)
// ============================================================
export const onVoteCreate = regional.firestore
  .document("votes/{voteId}")
  .onCreate(async (snap, _context) => {
    const data = snap.data();

    // Check for duplicate votes (same user, same match)
    const existingVotes = await db
      .collection("votes")
      .where("matchId", "==", data.matchId)
      .where("oylayanId", "==", data.oylayanId)
      .get();

    // If more than 1 (including this one), delete the duplicate
    if (existingVotes.size > 1) {
      await snap.ref.delete();
    }
  });

// ============================================================
// 7. PUSH NOTIFICATION HELPER
// ============================================================
async function sendPushToUser(userId: string, title: string, body: string) {
  try {
    const userDoc = await db.doc(`users/${userId}`).get();
    if (!userDoc.exists) return;

    const userData = userDoc.data()!;
    const pushToken = userData.pushToken || userData.expoPushToken;

    if (!pushToken) return;

    // For Expo push notifications
    if (pushToken.startsWith("ExponentPushToken")) {
      const message = {
        to: pushToken,
        sound: "default",
        title: title,
        body: body,
        data: { type: "notification" },
      };

      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      const resBodyText = await response.text();
      if (!response.ok) {
        console.error("Push notification failed:", resBodyText);
      } else {
        try {
          const resJson = JSON.parse(resBodyText);
          const data = resJson.data;
          // Expo returns an array of tickets or a single data ticket
          const details = data?.details || (Array.isArray(data) ? data[0]?.details : null);
          const error = details?.error || (Array.isArray(data) ? data[0]?.error : null);

          if (error === "DeviceNotRegistered") {
            console.log(`Token expired/unregistered for user ${userId}. Cleaning up tokens.`);
            await db.doc(`users/${userId}`).update({
              pushToken: admin.firestore.FieldValue.delete(),
              expoPushToken: admin.firestore.FieldValue.delete()
            });
          }
        } catch (parseErr) {
          console.error("Error parsing push receipt:", parseErr);
        }
      }
    }
  } catch (error) {
    console.error("Error sending push notification:", error);
  }
}

// ============================================================
// 8. CLEANUP - Auto-expire old notifications (daily task)
// ============================================================
async function cleanupOldNotifications() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Get read notifications older than 30 days
  const readNotifications = await db
    .collection("notifications")
    .where("read", "==", true)
    .where("createdAt", "<", thirtyDaysAgo)
    .limit(250)
    .get();

  // Get unread notifications older than 90 days
  const unreadNotifications = await db
    .collection("notifications")
    .where("read", "==", false)
    .where("createdAt", "<", ninetyDaysAgo)
    .limit(250)
    .get();

  const batch = db.batch();
  readNotifications.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  unreadNotifications.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();
  console.log(`Cleaned up ${readNotifications.size} read and ${unreadNotifications.size} unread old notifications`);
}

// ============================================================
// 9. MVP AUTO-CALCULATION - When match finishes, calculate MVP
// ============================================================

// Position-based MVP score weights
const MVP_WEIGHTS: Record<string, Record<string, number>> = {
  FW: { goal: 10, assist: 7, cleanSheet: 2, save: 0, penaltySave: 0, teamWin: 5, negative: -5 },
  MF: { goal: 10, assist: 7, cleanSheet: 2, save: 0, penaltySave: 0, teamWin: 5, negative: -5 },
  DF: { goal: 15, assist: 10, cleanSheet: 15, save: 2, penaltySave: 0, teamWin: 5, negative: -5 },
  GK: { goal: 50, assist: 20, cleanSheet: 25, save: 4, penaltySave: 20, teamWin: 5, negative: -5 }
};

function normalizePosition(pos: string): string {
  if (!pos) return "MF";
  const map: Record<string, string> = {
    FWD: "FW", Forvet: "FW", FW: "FW",
    MID: "MF", Ortasaha: "MF", "Orta Saha": "MF", MF: "MF", MD: "MF",
    DEF: "DF", Defans: "DF", DF: "DF",
    GK: "GK", Kaleci: "GK"
  };
  return map[pos] || "MF";
}

function calculateMvpScore(
  stats: any,
  positionCode: string,
  isLosingTeamGK: boolean,
  teamWon: boolean
): number {
  const normPos = normalizePosition(positionCode);
  const table = MVP_WEIGHTS[normPos] || MVP_WEIGHTS["MF"];
  let score = 0;

  score += (stats.goals || 0) * table.goal;
  score += (stats.assists || 0) * table.assist;
  score += stats.cleanSheet ? table.cleanSheet : 0;

  // GOALKEEPER_HERO_BONUS: Losing team keeper gets 1.5x save multiplier
  const saveMultiplier = (normPos === "GK" && isLosingTeamGK) ? 1.5 : 1;
  score += (stats.saves || 0) * table.save * saveMultiplier;

  score += (stats.penaltySaves || 0) * table.penaltySave;
  score += teamWon ? table.teamWin : 0;

  // Negative points: ownGoals, cards (yellow = 1, red = 2)
  const cards = (stats.yellowCards || 0) + (stats.redCards || 0) * 2;
  score += (stats.ownGoals || 0) * table.negative;
  score += cards * table.negative;

  return Math.max(0, score);
}

export const onMatchFinishMvp = regional.firestore
  .document("matches/{matchId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const matchId = context.params.matchId;

    // Only trigger when match status changes to FINISHED
    if (before.status === "FINISHED" || after.status !== "FINISHED") return;

    try {
      const participantsSnap = await db
        .collection("match_participants")
        .where("matchId", "==", matchId)
        .where("status", "==", "IN")
        .get();

      if (participantsSnap.empty) return;

      const scoreA = after.scoreA || 0;
      const scoreB = after.scoreB || 0;
      const losingTeam = scoreA > scoreB ? "B" : scoreA < scoreB ? "A" : null;

      // Calculate MVP scores for all participants
      const candidates: Array<{
        userId: string;
        name: string;
        team: string;
        score: number;
        position: string;
      }> = [];

      for (const pDoc of participantsSnap.docs) {
        const p = pDoc.data();
        if (!p.userId || p.userId.startsWith("guest_")) continue;

        const position = p.position || "MF";
        const isLosingGK = normalizePosition(position) === "GK" && p.team === losingTeam;
        const teamWon = (p.team === "A" && scoreA > scoreB) || (p.team === "B" && scoreB > scoreA);

        const mvpScore = calculateMvpScore(p, position, isLosingGK, teamWon);
        candidates.push({
          userId: p.userId,
          name: p.name || "Unknown",
          team: p.team || "A",
          score: mvpScore,
          position,
        });
      }

      // Sort by score descending
      candidates.sort((a, b) => b.score - a.score);

      // MVP_FAIR_PLAY: Ensure at least 1 candidate from losing team in top 4
      if (losingTeam && candidates.length >= 4) {
        const top4 = candidates.slice(0, 4);
        const winningTeam = losingTeam === "A" ? "B" : "A";
        const allWinners = top4.every((c) => c.team === winningTeam);

        if (allWinners) {
          // Replace 4th with best from losing team
          const bestLoser = candidates.find((c) => c.team === losingTeam);
          if (bestLoser) {
            candidates.splice(3, 1, bestLoser);
          }
        }
      }

      // MVP_SEEDING: Tennis-style matchups (1v8, 2v7, 3v6, 4v5)
      const top8 = candidates.slice(0, 8);
      const matchups: Array<{ player1: string; player2: string }> = [];
      const half = Math.floor(top8.length / 2);
      for (let i = 0; i < half; i++) {
        matchups.push({
          player1: top8[i].userId,
          player2: top8[top8.length - 1 - i].userId,
        });
      }

      // Save MVP session
      await db.collection("mvp_sessions").add({
        matchId,
        candidates: candidates.slice(0, 8).map((c, i) => ({
          userId: c.userId,
          name: c.name,
          team: c.team,
          score: c.score,
          position: c.position,
          seed: i + 1,
        })),
        matchups,
        status: "voting",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Notify all participants that MVP voting started
      const batch = db.batch();
      for (const pDoc of participantsSnap.docs) {
        const p = pDoc.data();
        if (!p.userId || p.userId.startsWith("guest_")) continue;

        const notifRef = db.collection("notifications").doc();
        batch.set(notifRef, {
          userId: p.userId,
          title: "MVP Oylaması Başladı! 🏆",
          body: "Maçın bitti! Şimdi en iyi oyuncuyu seç.",
          type: "match_invite",
          matchId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await sendPushToUser(
          p.userId,
          "MVP Oylaması Başladı! 🏆",
          "Maçın bitti! Şimdi en iyi oyuncuyu seç."
        );
      }
      await batch.commit();

      console.log(
        `MVP session created for match ${matchId} with ${candidates.length} candidates`
      );
    } catch (error) {
      console.error("Error calculating MVP:", error);
    }
  });

// ============================================================
// 10-11. STATS ENTRY WINDOW - reminder 3h before the 24h deadline, then fill 0s (hourly task)
// ============================================================
const STATS_WINDOW_MS = 24 * 60 * 60 * 1000;
const STATS_REMINDER_AFTER_MS = 21 * 60 * 60 * 1000;

async function runStatsWindow() {
  const now = Date.now();

  // Only matches whose window is still open (onMatchStatusUpdate stamps statsClosed=false on finish).
  const openMatches = await db
    .collection("matches")
    .where("status", "==", "FINISHED")
    .where("statsClosed", "==", false)
    .get();

  for (const matchDoc of openMatches.docs) {
    const matchData = matchDoc.data();
    if (matchData.isDeleted) continue;
    const finishedAt: Date | null =
      matchData.finishedAt?.toDate?.() ||
      matchData.statsOpenedAt?.toDate?.() ||
      matchData.updatedAt?.toDate?.() ||
      null;
    if (!finishedAt) continue;

    const elapsed = now - finishedAt.getTime();
    if (elapsed >= STATS_WINDOW_MS) {
      await closeStatsWindow(matchDoc);
    } else if (elapsed >= STATS_REMINDER_AFTER_MS && !matchData.statsReminderSent) {
      await sendStatsReminder(matchDoc);
    }
  }
}

const hasEnteredStats = (p: FirebaseFirestore.DocumentData) => p.statsEntered === true || p.statsSubmitted === true;

async function closeStatsWindow(matchDoc: admin.firestore.QueryDocumentSnapshot) {
  const matchId = matchDoc.id;

  // Get participants who haven't entered stats
  const participantsSnap = await db
    .collection("match_participants")
    .where("matchId", "==", matchId)
    .where("status", "==", "IN")
    .get();

  const batch = db.batch();
  let updated = 0;

  for (const pDoc of participantsSnap.docs) {
    const p = pDoc.data();
    // Post-match used to write only statsSubmitted; both flags mean the player entered their stats.
    if (!hasEnteredStats(p)) {
      batch.update(pDoc.ref, {
        goals: 0,
        assists: 0,
        saves: 0,
        statsEntered: true,
        statsAutoFilled: true,
        statsFilledAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      updated++;
    }
  }

  // Mark match stats as closed
  batch.update(matchDoc.ref, { statsClosed: true });
  await batch.commit();

  if (updated > 0) {
    console.log(`Auto-closed stats for match ${matchId}: ${updated} players filled with 0s`);
  }
}

async function sendStatsReminder(matchDoc: admin.firestore.QueryDocumentSnapshot) {
  // Get participants who haven't entered stats
  const participantsSnap = await db
    .collection("match_participants")
    .where("matchId", "==", matchDoc.id)
    .where("status", "==", "IN")
    .get();

  const batch = db.batch();
  for (const pDoc of participantsSnap.docs) {
    const p = pDoc.data();
    if (!hasEnteredStats(p) && p.userId && !p.userId.startsWith("guest_")) {
      const notifRef = db.collection("notifications").doc();
      batch.set(notifRef, {
        userId: p.userId,
        title: "İstatistik Hatırlatıcı ⏰",
        body: "İstatistiklerini girmek için 3 saatin var!",
        type: "match_reminder",
        matchId: matchDoc.id,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await sendPushToUser(
        p.userId,
        "İstatistik Hatırlatıcı ⏰",
        "İstatistiklerini girmek için 3 saatin var!"
      );
    }
  }

  batch.update(matchDoc.ref, { statsReminderSent: true });
  await batch.commit();
}

// ============================================================
// 12. DISPUTE AUTO-RESOLVE - Resolve after 48h admin deadline (hourly task)
// ============================================================
async function resolveExpiredDisputes() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // Find open disputes older than 48h
  const disputesSnap = await db
    .collection("disputes")
    .where("status", "==", "open")
    .get();

  for (const disputeDoc of disputesSnap.docs) {
    const dispute = disputeDoc.data();
    const createdAt = dispute.createdAt?.toDate?.() || null;
    if (!createdAt || createdAt > cutoff) continue;

    // Auto-resolve: original data wins (admin didn't respond in time)
    await disputeDoc.ref.update({
      status: "auto_resolved",
      resolution: "original_data_kept",
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolvedBy: "system",
      note: "Admin 48 saat içinde yanıt vermedi. Orijinal veri geçerli sayıldı.",
    });

    // Notify player
    const notifRef = db.collection("notifications").doc();
    await notifRef.set({
      userId: dispute.playerId,
      title: "İtiraz Sonuçlandı ✅",
      body: "Admin süre içinde yanıt vermedi. Orijinal istatistiklerin geçerli.",
      type: "general",
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await sendPushToUser(
      dispute.playerId,
      "İtiraz Sonuçlandı ✅",
      "Orijinal istatistiklerin geçerli sayıldı."
    );

    console.log(`Auto-resolved dispute ${disputeDoc.id}`);
  }
}

// ============================================================
// 13. VACATION AUTO-EXPIRE (daily task)
// ============================================================
async function expireVacations() {
  const now = new Date();

  const vacationsSnap = await db
    .collection("vacation_mode")
    .where("isActive", "==", true)
    .get();

  for (const vacDoc of vacationsSnap.docs) {
    const vacation = vacDoc.data();
    // Field names match services/vacationService.ts (isActive, endsAt, deactivatedAt).
    const endsAt = vacation.endsAt?.toDate?.() || null;

    if (!endsAt || endsAt > now) continue;

    // Expire the vacation
    await vacDoc.ref.update({
      isActive: false,
      autoExpired: true,
      deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Notify user
    const notifRef = db.collection("notifications").doc();
    await notifRef.set({
      userId: vacation.userId,
      title: "İzin Süresi Doldu ⏰",
      body: "İzin/sakatlık süreniz sona erdi. Aktiflik puanınız tekrar hesaplanmaya başlayacak.",
      type: "general",
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await sendPushToUser(
      vacation.userId,
      "İzin Süresi Doldu ⏰",
      "İzin/sakatlık süreniz sona erdi."
    );

    console.log(`Auto-expired vacation for user ${vacation.userId}`);
  }
}

// ============================================================
// ACCOUNT DELETION - 30-day grace period, then permanent removal (daily task)
// ============================================================
// Deletion is requested through a callable so the client never deletes shared data itself. The
// profile is flagged and hidden; signing in again within the grace period offers a restore.
const ACCOUNT_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const DELETED_USER_NAME = "Silinmiş Hesap";

export const requestAccountDeletion = regional.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Giriş yapmalısın.");
  const userRef = db.doc(`users/${uid}`);
  const snap = await userRef.get();
  if (!snap.exists) throw new functions.https.HttpsError("not-found", "Profil bulunamadı.");

  const reason = typeof data?.reason === "string" ? data.reason.trim().slice(0, 500) : "";
  const scheduledFor = admin.firestore.Timestamp.fromMillis(Date.now() + ACCOUNT_GRACE_MS);
  await userRef.update({
    isDeleted: true,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    deletionScheduledFor: scheduledFor,
    deletionReason: reason || null,
  });
  await leaveUpcomingMatches(uid);
  return { deletionScheduledFor: scheduledFor.toMillis() };
});

export const restoreAccount = regional.https.onCall(async (_data, context) => {
  const uid = context.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Giriş yapmalısın.");
  const userRef = db.doc(`users/${uid}`);
  const snap = await userRef.get();
  if (!snap.exists) throw new functions.https.HttpsError("not-found", "Hesap kalıcı olarak silinmiş.");
  if (!snap.data()!.isDeleted) return { restored: false };

  const remove = admin.firestore.FieldValue.delete();
  await userRef.update({
    isDeleted: false,
    deletedAt: remove,
    deletionScheduledFor: remove,
    deletionReason: remove,
    restoredAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { restored: true };
});

/** Frees the user's spots in upcoming matches; a freed spot goes to the first waitlisted player. */
async function leaveUpcomingMatches(uid: string) {
  const entries = await db
    .collection("match_participants")
    .where("userId", "==", uid)
    .where("status", "in", ["IN", "WAITLIST", "MAYBE"])
    .get();
  const now = Date.now();

  for (const entry of entries.docs) {
    const matchRef = db.doc(`matches/${entry.data().matchId}`);
    try {
      const promoted = await db.runTransaction(async (tx) => {
        const [matchSnap, entrySnap] = await Promise.all([tx.get(matchRef), tx.get(entry.ref)]);
        if (!matchSnap.exists || !entrySnap.exists) return null;
        const match = matchSnap.data()!;
        const date: Date | null = match.date?.toDate?.() ?? null;
        if (match.isDeleted || (match.status && match.status !== "UPCOMING") || (date && date.getTime() < now)) return null;

        const wasIn = entrySnap.data()!.status === "IN";
        // Transactions read everything before writing.
        const waitlist = wasIn ? await tx.get(
          db.collection("match_participants")
            .where("matchId", "==", matchRef.id)
            .where("status", "==", "WAITLIST")
            .orderBy("updatedAt", "asc")
            .limit(2)
        ) : null;

        const stamp = admin.firestore.FieldValue.serverTimestamp();
        tx.update(entry.ref, { status: "OUT", team: null, teamIndex: null, updatedAt: stamp });
        if (!wasIn) return null;

        const next = waitlist?.docs.find((d) => d.id !== entry.id);
        if (next) {
          tx.update(next.ref, { status: "IN", updatedAt: stamp });
          return { userId: next.data().userId as string, matchId: matchRef.id };
        }
        tx.update(matchRef, { playerCount: Math.max(0, (match.playerCount || 0) - 1) });
        return null;
      });

      if (promoted?.userId && !promoted.userId.startsWith("guest_")) {
        await db.collection("notifications").add({
          userId: promoted.userId,
          title: "Kadroya Girdin!",
          body: "Maçta yer açıldı ve otomatik olarak kadroya eklendin. İyi maçlar!",
          type: "match_join",
          matchId: promoted.matchId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await sendPushToUser(promoted.userId, "Kadroya Girdin!", "Maçta yer açıldı ve kadroya eklendin.");
      }
    } catch (error) {
      console.error(`Error removing ${uid} from match ${matchRef.id}:`, error);
    }
  }
}

async function purgeDeletedAccounts() {
  // Single-field range query (no composite index); the flag is checked in code.
  const due = await db
    .collection("users")
    .where("deletionScheduledFor", "<=", admin.firestore.Timestamp.now())
    .limit(25)
    .get();

  for (const userDoc of due.docs) {
    if (userDoc.data().isDeleted !== true) continue;
    try {
      await purgeAccount(userDoc.id, userDoc.data());
      console.log(`Permanently deleted account ${userDoc.id}`);
    } catch (error) {
      console.error(`Error purging account ${userDoc.id}:`, error);
    }
  }
}

async function purgeAccount(uid: string, profile: FirebaseFirestore.DocumentData) {
  const userRef = db.doc(`users/${uid}`);
  const remove = admin.firestore.FieldValue.delete();

  const [entries, groups, following, followers, notifications, invitesTo, invitesFrom, requests, vacations] = await Promise.all([
    db.collection("match_participants").where("userId", "==", uid).get(),
    db.collection("groups").where("members", "array-contains", uid).get(),
    userRef.collection("following").get(),
    userRef.collection("followers").get(),
    db.collection("notifications").where("userId", "==", uid).get(),
    db.collection("invites").where("toUserId", "==", uid).get(),
    db.collection("invites").where("fromUserId", "==", uid).get(),
    db.collection("group_requests").where("userId", "==", uid).get(),
    db.collection("vacation_mode").where("userId", "==", uid).get(),
  ]);

  const writer = db.bulkWriter();
  // Missing docs (e.g. a follower who already left) must not fail the whole purge.
  writer.onWriteError(() => false);
  const queue = (op: Promise<unknown>) => op.catch(() => undefined);

  // Past match entries keep their numbers for the other players' history, without the identity.
  entries.docs.forEach((d) => queue(writer.update(d.ref, { name: DELETED_USER_NAME, photoURL: remove })));

  for (const g of groups.docs) {
    const data = g.data();
    const members: string[] = (data.members || []).filter((m: string) => m !== uid);
    if (members.length === 0) {
      queue(writer.delete(g.ref));
      continue;
    }
    let admins: string[] = (data.admins || []).filter((a: string) => a !== uid);
    const adminId: string = data.adminId === uid || !data.adminId ? (admins[0] || members[0]) : data.adminId;
    if (!admins.includes(adminId)) admins = [...admins, adminId];
    queue(writer.update(g.ref, {
      members,
      admins,
      adminId,
      memberDetails: (data.memberDetails || []).filter((m: any) => m?.uid !== uid),
      [`memberRatings.${uid}`]: remove,
    }));
  }

  following.docs.forEach((d) => {
    const other = db.doc(`users/${d.id}`);
    queue(writer.delete(other.collection("followers").doc(uid)));
    queue(writer.update(other, { followersCount: admin.firestore.FieldValue.increment(-1) }));
  });
  followers.docs.forEach((d) => {
    const other = db.doc(`users/${d.id}`);
    queue(writer.delete(other.collection("following").doc(uid)));
    queue(writer.update(other, { followingCount: admin.firestore.FieldValue.increment(-1) }));
  });

  [notifications, invitesTo, invitesFrom, requests, vacations].forEach((snap) =>
    snap.docs.forEach((d) => queue(writer.delete(d.ref)))
  );

  if (profile.username) {
    const reservation = await db.doc(`usernames/${profile.username}`).get();
    if (reservation.exists && reservation.data()!.uid === uid) queue(writer.delete(reservation.ref));
  }

  await writer.close();

  await admin.storage().bucket().deleteFiles({ prefix: `avatars/${uid}/` }).catch((error) => {
    console.warn(`Could not delete avatar files for ${uid}:`, error);
  });
  // Removes the profile together with its subcollections (following, followers, badges, blocks).
  await db.recursiveDelete(userRef);
  await admin.auth().deleteUser(uid).catch((error) => {
    if (error?.code !== "auth/user-not-found") throw error;
  });
}

// ============================================================
// SANDBOX SUBSCRIPTIONS - development only
// ============================================================
// Subscription fields are server-owned (security rules). Until RevenueCat webhooks write them, the
// premium screen's sandbox switches tiers through this callable. It refuses to run unless
// functions/.env sets SANDBOX_PURCHASES=true — turn that off before a production release, otherwise
// anyone could grant themselves a subscription by calling it.
const SANDBOX_TIERS = ["free", "player", "captain"];

export const setSandboxSubscription = regional.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Giriş yapmalısın.");
  if (process.env.SANDBOX_PURCHASES !== "true") {
    throw new functions.https.HttpsError("failed-precondition", "Sandbox satın alma bu ortamda kapalı.");
  }

  const update: Record<string, unknown> = {};
  if (data?.tier !== undefined) {
    if (!SANDBOX_TIERS.includes(data.tier)) {
      throw new functions.https.HttpsError("invalid-argument", "Geçersiz abonelik türü.");
    }
    update["subscription.tier"] = data.tier;
    update.isPremium = data.tier !== "free";
  }
  if (typeof data?.tokenMatchId === "string" && data.tokenMatchId) {
    update["subscription.activeTokenMatchIds"] = admin.firestore.FieldValue.arrayUnion(data.tokenMatchId);
  }
  if (Object.keys(update).length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "Değişiklik yok.");
  }

  await db.doc(`users/${uid}`).update(update);
  return { ok: true };
});

// ============================================================
// SCHEDULED JOBS
// ============================================================
// Cloud Scheduler bills per job beyond the 3 free jobs of a billing account, so every periodic
// task runs from one of these three. A failing task is logged and doesn't stop the others.
async function runTasks(job: string, tasks: Record<string, () => Promise<unknown>>) {
  for (const [name, task] of Object.entries(tasks)) {
    try {
      await task();
    } catch (error) {
      console.error(`[${job}] ${name} failed:`, error);
    }
  }
}

export const scheduledEvery10Minutes = regional.pubsub
  .schedule("every 10 minutes")
  .timeZone("Europe/Istanbul")
  .onRun(async () => {
    await runTasks("every10Minutes", { closeExpiredMvpSessions });
    return null;
  });

export const scheduledHourly = regional.pubsub
  .schedule("every 60 minutes")
  .timeZone("Europe/Istanbul")
  .onRun(async () => {
    await runTasks("hourly", { sendMatchReminders, runStatsWindow, resolveExpiredDisputes });
    return null;
  });

export const scheduledDaily = regional.pubsub
  .schedule("every 24 hours")
  .timeZone("Europe/Istanbul")
  .onRun(async () => {
    await runTasks("daily", { cleanupOldNotifications, expireVacations, purgeDeletedAccounts, refreshActivityOveralls });
    return null;
  });

// ============================================================
// 14. OVERALL RECALCULATION - New Hybrid Display/Group System
// ============================================================

// Form Bonus = (Avg - 5) × 2, range: -10 to +10
function calcFormBonus(formScores: number[]): number {
  if (!formScores || formScores.length === 0) return 0;
  const avg = formScores.reduce((a, b) => a + b, 0) / formScores.length;
  const bonus = (avg - 5) * 2;
  return Math.round(Math.max(-10, Math.min(10, bonus)));
}

// Activity Bonus: ≤7d → +3, ≤14d → +2, ≤30d → 0, ≤60d → -2, >60d → -3
function calcActivityBonusNew(daysSinceLastMatch: number | null): number {
  if (daysSinceLastMatch === null) return 0;
  if (daysSinceLastMatch <= 7) return 3;
  if (daysSinceLastMatch <= 14) return 2;
  if (daysSinceLastMatch <= 30) return 0;
  if (daysSinceLastMatch <= 60) return -2;
  return -3;
}

// MVP Bonus = min(mvpCount × 0.3, 2)
function calcMvpBonus(mvpCount: number): number {
  return Math.round(Math.min(mvpCount * 0.3, 2));
}

// Win Rate Bonus = clamp((winRate - 0.5) × 6, -3, +3)
function calcWinRateBonus(winRate: number): number {
  const bonus = (winRate - 0.5) * 6;
  return Math.round(Math.max(-3, Math.min(3, bonus)));
}

// Calculate form score for a single match participation
function calcMatchFormScore(p: any, isWin: boolean): number {
  let rating = 5.0; // Base
  rating += Math.min((p.goals || 0) * 1.5, 3.0);  // Goals: +1.5 each, max +3
  rating += Math.min((p.assists || 0) * 1.0, 2.0); // Assists: +1.0 each, max +2
  if (isWin) rating += 1.0;
  if (p.cleanSheet) rating += 0.5;
  // MVP bonus handled separately in the overall, not double-counted in form
  return Math.min(10, Math.max(0, rating));
}

async function runRecalculateOverall(userId: string): Promise<void> {
  try {
    const userDoc = await db.doc(`users/${userId}`).get();
    if (!userDoc.exists) return;
    const userData = userDoc.data()!;

    // Check vacation mode
    const vacationSnap = await db
      .collection("vacation_mode")
      .where("userId", "==", userId)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (!vacationSnap.empty) {
      console.log(`User ${userId} is on vacation, skipping overall update`);
      return;
    }

    // ── Step 1: Get Average Group Base ──
    const groupsSnap = await db
      .collection("groups")
      .where("members", "array-contains", userId)
      .get();

    const groupBases: number[] = [];
    for (const groupDoc of groupsSnap.docs) {
      const groupData = groupDoc.data();
      const memberRatings = groupData.memberRatings || {};
      const userRating = memberRatings[userId];

      if (userRating !== undefined) {
        let ratingValue = 0;
        if (typeof userRating === "object" && userRating !== null) {
          // If stored as {rating, skillLevel, ...}
          if (userRating.skillLevel) {
            ratingValue = (userRating.skillLevel * 6) + 40;
          } else {
            ratingValue = userRating.rating || userRating.overall || 0;
          }
        } else if (typeof userRating === "number") {
          ratingValue = userRating;
        }
        if (ratingValue > 0) {
          groupBases.push(ratingValue);
        }
      }
    }

    let averageBase = 65; // Default for no groups
    if (groupBases.length > 0) {
      averageBase = Math.round(
        groupBases.reduce((a, b) => a + b, 0) / groupBases.length
      );
    }

    // ── Step 2: Calculate Form Bonus from the last 10 finished matches ──
    // Participant entries have no createdAt, so recency comes from the matches' kick-off dates.
    const participations = await db
      .collection("match_participants")
      .where("userId", "==", userId)
      .where("status", "==", "IN")
      .get();

    const matchIds = [...new Set(participations.docs.map((d) => d.data().matchId).filter(Boolean))] as string[];
    const matchById = new Map<string, FirebaseFirestore.DocumentData>();
    for (let i = 0; i < matchIds.length; i += 100) {
      const docs = await db.getAll(...matchIds.slice(i, i + 100).map((id) => db.doc(`matches/${id}`)));
      docs.forEach((d) => { if (d.exists) matchById.set(d.id, d.data()!); });
    }

    const recentFinished = participations.docs
      .map((d) => ({ p: d.data(), m: matchById.get(d.data().matchId) }))
      .filter((entry): entry is { p: FirebaseFirestore.DocumentData; m: FirebaseFirestore.DocumentData } =>
        !!entry.m && entry.m.status === "FINISHED" && !entry.m.isDeleted)
      .sort((a, b) => (b.m.date?.toMillis?.() ?? 0) - (a.m.date?.toMillis?.() ?? 0))
      .slice(0, 10);

    const formScores = recentFinished.map(({ p, m }) => {
      const hasScore = typeof m.scoreA === "number" && typeof m.scoreB === "number";
      const isWin = hasScore && ((p.team === "A" && m.scoreA > m.scoreB) || (p.team === "B" && m.scoreB > m.scoreA));
      return calcMatchFormScore(p, isWin);
    });

    // Match count comes from the server-owned stats; form and win rate are noisy for new players,
    // so they phase in over the first 5 matches (calibration).
    const matchCount = userData.stats?.matchesPlayed ?? userData.matchesPlayed ?? 0;
    const calibrationWeight = Math.min(1, matchCount / 5);
    const formBonus = Math.round(calcFormBonus(formScores) * calibrationWeight);

    // ── Step 3: Calculate Activity Bonus ──
    const lastMatch = userData.lastMatchDate?.toDate?.() || null;
    let daysSinceLastMatch: number | null = null;
    if (lastMatch) {
      daysSinceLastMatch = Math.floor(
        (Date.now() - lastMatch.getTime()) / (1000 * 60 * 60 * 24)
      );
    }
    const activityBonus = calcActivityBonusNew(daysSinceLastMatch);

    // ── Step 4: MVP Bonus ──
    const mvpCount = userData.stats?.motmCount || 0;
    const mvpBonus = calcMvpBonus(mvpCount);

    // ── Step 5: Win Rate Bonus ──
    // A draw counts as half a win; a player without matches is neutral rather than at a 0% win rate.
    const wins = userData.stats?.wins || 0;
    const draws = userData.stats?.draws || 0;
    const winRateBonus = matchCount > 0
      ? Math.round(calcWinRateBonus((wins + draws * 0.5) / matchCount) * calibrationWeight)
      : 0;

    // ── Step 6: Calculate Display Overall ──
    const rawOverall = averageBase + formBonus + activityBonus + mvpBonus + winRateBonus;
    const newOverall = Math.max(40, Math.min(99, rawOverall));

    const isCalibrating = matchCount < 5;

    // Update user's overall
    await db.doc(`users/${userId}`).update({
      overall: newOverall,
      overallBreakdown: {
        averageBase,
        formBonus,
        activityBonus,
        mvpBonus,
        winRateBonus,
      },
      isCalibrating,
      lastOverallUpdate: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(
      `Recalculated overall for ${userId}: ${newOverall} (base:${averageBase} form:${formBonus} activity:${activityBonus} mvp:${mvpBonus} winRate:${winRateBonus} matches:${matchCount})`
    );
  } catch (error) {
    console.error(`Error in runRecalculateOverall for ${userId}:`, error);
  }
}

export const recalculateOverall = regional.firestore
  .document("users/{userId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const userId = context.params.userId;

    // Only trigger when matchesPlayed or stats change
    const statsChanged =
      before.matchesPlayed !== after.matchesPlayed ||
      JSON.stringify(before.stats) !== JSON.stringify(after.stats);

    if (!statsChanged) return;

    // Don't trigger infinite loop (check if only overall changed)
    if (
      before.overall !== after.overall &&
      before.matchesPlayed === after.matchesPlayed
    )
      return;

    await runRecalculateOverall(userId);
  });

export const onGroupUpdate = regional.firestore
  .document("groups/{groupId}")
  .onUpdate(async (change, _context) => {
    const before = change.before.data();
    const after = change.after.data();

    const beforeRatings = before.memberRatings || {};
    const afterRatings = after.memberRatings || {};

    // Get all userIds where ratings changed (ratings may be numbers or legacy objects)
    const allUserIds = new Set([
      ...Object.keys(beforeRatings),
      ...Object.keys(afterRatings)
    ]);

    const usersToRecalculate = new Set<string>();
    for (const userId of allUserIds) {
      if (JSON.stringify(beforeRatings[userId]) !== JSON.stringify(afterRatings[userId])) {
        usersToRecalculate.add(userId);
      }
    }

    // Joining or leaving a group adds or drops that group's base from the player's average.
    const beforeMembers = new Set<string>(before.members || []);
    const afterMembers = new Set<string>(after.members || []);
    for (const userId of new Set([...beforeMembers, ...afterMembers])) {
      if (beforeMembers.has(userId) !== afterMembers.has(userId) && afterRatings[userId] !== undefined) {
        usersToRecalculate.add(userId);
      }
    }

    if (usersToRecalculate.size === 0) return;

    console.log(`onGroupUpdate triggered: recalculating overall for users: ${[...usersToRecalculate].join(", ")}`);

    // Run recalculation for each user in parallel
    await Promise.all([...usersToRecalculate].map((userId) => runRecalculateOverall(userId)));
  });

// Activity bonus steps change when a player's last match becomes 8, 15, 31 or 61 days old.
const ACTIVITY_STEP_DAYS = new Set([8, 15, 31, 61]);

/** Daily task: players crossing an activity step get their overall recalculated without a new match. */
async function refreshActivityOveralls() {
  const since = admin.firestore.Timestamp.fromMillis(Date.now() - 62 * 24 * 60 * 60 * 1000);
  const users = await db.collection("users").where("lastMatchDate", ">=", since).get();
  const now = Date.now();
  for (const userDoc of users.docs) {
    const last: Date | null = userDoc.data().lastMatchDate?.toDate?.() ?? null;
    if (!last) continue;
    const days = Math.floor((now - last.getTime()) / (24 * 60 * 60 * 1000));
    if (ACTIVITY_STEP_DAYS.has(days)) await runRecalculateOverall(userDoc.id);
  }
}

// ============================================================
// 15. ADMIN STAT CHANGE NOTIFICATION
// ============================================================
export const onStatChange = regional.firestore
  .document("match_participants/{participantId}")
  .onUpdate(async (change, _context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Check if stats were changed by someone other than the participant
    const statsChanged =
      before.goals !== after.goals ||
      before.assists !== after.assists ||
      before.saves !== after.saves;

    if (!statsChanged) return;

    // If the participant entered their own stats, skip
    if (after.statsEnteredBy === after.userId) return;

    // If admin changed stats, notify the player
    if (
      after.statsEnteredBy &&
      after.statsEnteredBy !== after.userId &&
      after.userId &&
      !after.userId.startsWith("guest_")
    ) {
      try {
        const changes: string[] = [];
        if (before.goals !== after.goals)
          changes.push(`Gol: ${before.goals || 0} → ${after.goals || 0}`);
        if (before.assists !== after.assists)
          changes.push(`Asist: ${before.assists || 0} → ${after.assists || 0}`);
        if (before.saves !== after.saves)
          changes.push(
            `Kurtarış: ${before.saves || 0} → ${after.saves || 0}`
          );

        await db.collection("notifications").add({
          userId: after.userId,
          title: "İstatistik Güncellemesi 📊",
          body: `Admin istatistiklerini güncelledi: ${changes.join(", ")}`,
          type: "general",
          matchId: after.matchId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await sendPushToUser(
          after.userId,
          "İstatistik Güncellemesi 📊",
          `Admin istatistiklerini güncelledi: ${changes.join(", ")}`
        );
      } catch (error) {
        console.error("Error sending stat change notification:", error);
      }
    }
  });

