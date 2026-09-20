import {
  Firestore,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { saveNotification } from './notificationService';

export const createMatch = async (groupId: string | null, venue: string, date: Date, price: number, creatorId: string, creatorName: string, maxPlayers: number = 14, customizations?: any) => {
  try {
    // Validate required fields
    if (!venue || typeof venue !== 'string' || venue.trim().length === 0) {
      throw new Error('Geçerli bir saha adı giriniz.');
    }
    if (!creatorId) throw new Error('Oluşturucu bilgisi bulunamadı.');
    if (maxPlayers < 2 || maxPlayers > 30) throw new Error('Oyuncu sayısı 2-30 arasında olmalıdır.');
    if (price < 0) throw new Error('Ücret negatif olamaz.');
    if (date.getTime() < Date.now()) {
      throw new Error('Geçersiz tarih. Maç tarihi geçmiş bir zaman olamaz.');
    }

    // Sanitize customizations - only allow known fields
    const ALLOWED_CUSTOMIZATIONS = ['matchType', 'duration', 'notes', 'fieldType', 'isPrivate', 'halfDuration', 'autoBalance'];
    const safeCustomizations: any = {};
    if (customizations && typeof customizations === 'object') {
      for (const key of ALLOWED_CUSTOMIZATIONS) {
        if (key in customizations) {
          safeCustomizations[key] = customizations[key];
        }
      }
    }

    const matchRef = await addDoc(collection(db, "matches"), {
      groupId,
      venue: venue.trim(),
      date: date,
      feePerPerson: price,
      status: "UPCOMING",
      playerCount: 1,
      maxPlayers,
      creatorId,
      createdAt: serverTimestamp(),
      ...safeCustomizations
    });

    // Add creator as participant
    const participantRef = doc(db, "match_participants", `${matchRef.id}_${creatorId}`);
    await setDoc(participantRef, {
      matchId: matchRef.id,
      userId: creatorId,
      name: creatorName,
      status: 'IN',
      updatedAt: serverTimestamp()
    });

    // Notify other group members client-side
    if (groupId) {
      try {
        const groupRef = doc(db, "groups", groupId);
        const groupSnap = await getDoc(groupRef);
        if (groupSnap.exists()) {
          const groupData = groupSnap.data();
          const members = groupData.members || [];
          const otherMembers = members.filter((memberId: string) => memberId !== creatorId);
          
          const venueName = venue.trim();
          const formattedDate = date.toLocaleDateString("tr-TR") + " saat " + date.toLocaleTimeString("tr-TR", { hour: '2-digit', minute: '2-digit' });
          
          await Promise.all(
            otherMembers.map((memberId: string) =>
              saveNotification({
                userId: memberId,
                title: "Yeni Maç Oluşturuldu",
                body: `"${groupData.name}" grubunda yeni bir maç oluşturuldu: ${venueName} (${formattedDate})`,
                type: "match_invite",
                matchId: matchRef.id,
                groupId: groupId,
                read: false,
              }).catch(err => console.error(`Error notifying member ${memberId}:`, err))
            )
          );
        }
      } catch (err) {
        console.error("Error sending group match creation notifications:", err);
      }
    }

    return matchRef.id;
  } catch (error) {
    console.error("Error creating match: ", error);
    throw error;
  }
};

export const getUserMatches = async (userId: string) => {
  try {
    // 1. Get all match participations for the user
    const q = query(collection(db, "match_participants"), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);

    // 2. Extract unique match IDs and map participation data
    const participationMap: Record<string, any> = {};
    querySnapshot.docs.forEach(doc => {
      const data = doc.data();
      participationMap[data.matchId] = data;
    });

    const matchIds = Object.keys(participationMap);

    if (matchIds.length === 0) return [];

    // 3. Batch fetch match details (Firestore 'in' supports max 10, so batch in groups)
    const BATCH_SIZE = 10;
    const allMatches: any[] = [];

    for (let i = 0; i < matchIds.length; i += BATCH_SIZE) {
      const batchIds = matchIds.slice(i, i + BATCH_SIZE);
      const batchPromises = batchIds.map(id => getMatchDetails(id));
      const batchResults = await Promise.all(batchPromises);

      const mergedMatches = batchResults
         .filter(m => m !== null && !(m as any).isDeleted)
         .map(m => ({
          ...m,
          playerStats: participationMap[m!.id]
        }));

      allMatches.push(...mergedMatches);
    }

    return allMatches;
  } catch (error) {
    console.error("Error fetching user matches: ", error);
    throw error;
  }
};

export const getGroupMatches = async (groupId: string) => {
  try {
    const q = query(collection(db, "matches"), where("groupId", "==", groupId));
    const querySnapshot = await getDocs(q);
    // Note: Date formatting should be handled in the UI
    const matches = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        date: data.date?.toDate ? data.date.toDate() : new Date(data.date)
      };
    });
    return matches.filter(m => !(m as any).isDeleted);
  } catch (error) {
    console.error("Error fetching matches: ", error);
    throw error;
  }
};

/** Soft-deleted (cancelled) matches read as missing unless `includeDeleted` is set. */
export const getMatchDetails = async (matchId: string, { includeDeleted = false }: { includeDeleted?: boolean } = {}) => {
  try {
    const docRef = doc(db, "matches", matchId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && (includeDeleted || !docSnap.data().isDeleted)) {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        date: data.date?.toDate ? data.date.toDate() : new Date(data.date)
      };
    } else {
      // Match might have been deleted, return null silently
      return null;
    }
  } catch (error) {
    console.error("Error fetching match details: ", error);
    throw error;
  }
};

export const updateMatch = async (matchId: string, data: any) => {
  try {
    const whitelist = ['venue', 'date', 'maxPlayers', 'status', 'scoreA', 'scoreB', 'feePerPerson', 'playerCount', 'statsClosed'];
    const filteredData: any = {};
    Object.keys(data).forEach((key) => {
      if (whitelist.includes(key)) {
        filteredData[key] = data[key];
      }
    });

    if (Object.keys(filteredData).length === 0) {
      console.warn("No whitelisted fields provided to updateMatch");
      return;
    }

    const docRef = doc(db, "matches", matchId);
    await updateDoc(docRef, filteredData);
  } catch (error) {
    console.error("Error updating match: ", error);
    throw error;
  }
};

/** joinMatch throws Error('MATCH_FULL') when the roster is full; callers can offer the waitlist. */
export const isMatchFullError = (error: unknown) => error instanceof Error && error.message === 'MATCH_FULL';

/**
 * `firestore` lets the Test Lab run this as a bot account (a separate signed-in Firebase app), so the
 * write goes through the same rules and triggers as a real second device. Screens use the default.
 */
export type ServiceOptions = { firestore?: Firestore };

export const joinMatch = async (matchId: string, userId: string, userName: string, status: 'IN' | 'OUT' | 'MAYBE' | 'WAITLIST', { firestore = db }: ServiceOptions = {}) => {
  try {
    const participantRef = doc(firestore, "match_participants", `${matchId}_${userId}`);
    const matchRef = doc(firestore, "matches", matchId);
    const userRef = doc(firestore, "users", userId);

    let shouldCheckWaitlist = false;

    await runTransaction(firestore, async (transaction) => {
      const matchDoc = await transaction.get(matchRef);
      if (!matchDoc.exists()) {
        throw new Error("Maç bulunamadı!");
      }

      // Fetch user data for position
      const userDoc = await transaction.get(userRef);
      const userPosition = userDoc.exists() ? userDoc.data().position : 'Forvet';

      const matchData = matchDoc.data();
      if (matchData.isDeleted) {
        throw new Error('Bu maç iptal edildi.');
      }
      const matchStatus = matchData.status || 'UPCOMING';
      if (matchStatus === 'FINISHED' || matchStatus === 'STATS_LOCKED') {
        throw new Error('Bu maç tamamlandığı için katılım durumu değiştirilemez.');
      }
      if (matchStatus === 'CANCELLED') {
        throw new Error('Bu maç iptal edildiği için katılım durumu değiştirilemez.');
      }

      const matchDate = matchData.date?.toDate ? matchData.date.toDate() : new Date(matchData.date);
      if (matchDate && matchDate.getTime() < Date.now()) {
        throw new Error('Maç saati geçtiği için katılım durumu değiştirilemez.');
      }

      const maxPlayers = matchData.maxPlayers || 14;
      const currentPlayerCount = matchData.playerCount || 0;

      const participantDoc = await transaction.get(participantRef);
      const oldStatus = participantDoc.exists() ? participantDoc.data().status : null;

      // If joining as IN: Check capacity (unless already IN)
      if (status === 'IN' && oldStatus !== 'IN') {
        if (currentPlayerCount >= maxPlayers) {
          throw new Error("MATCH_FULL");
        }
        transaction.update(matchRef, { playerCount: currentPlayerCount + 1 });
      }
      // If leaving (IN -> OUT/WAITLIST/MAYBE): Decrement count
      else if (status !== 'IN' && oldStatus === 'IN') {
        transaction.update(matchRef, { playerCount: currentPlayerCount - 1 });
        shouldCheckWaitlist = true;
      }

      // Update participant - preserve existing fields
      const participantData: any = {
        matchId,
        userId,
        name: userName,
        position: userPosition,
        status,
        updatedAt: serverTimestamp()
      };

      // If status is NOT 'IN', clear team assignment
      if (status !== 'IN') {
        participantData.team = null;
        participantData.teamIndex = null;
      }

      if (participantDoc.exists()) {
        transaction.update(participantRef, participantData);
      } else {
        transaction.set(participantRef, participantData);
      }
    });

    // Only check waitlist if someone actually left (IN -> non-IN)
    if (shouldCheckWaitlist) {
      await checkAndPromoteWaitlist(matchId, { firestore, actorId: userId });
    }

  } catch (error) {
    if (error instanceof Error && error.message === "MATCH_FULL") throw error;
    console.error("Error joining match: ", error);
    throw error;
  }
};

export const checkAndPromoteWaitlist = async (matchId: string, { firestore = db, actorId }: ServiceOptions & { actorId?: string } = {}) => {
  try {
    await runTransaction(firestore, async (transaction) => {
      const matchRef = doc(firestore, "matches", matchId);
      const matchDoc = await transaction.get(matchRef);
      if (!matchDoc.exists()) throw new Error("Maç bulunamadı");

      const matchData = matchDoc.data();
      const maxPlayers = matchData.maxPlayers || 14;
      const currentPlayerCount = matchData.playerCount || 0;

      if (currentPlayerCount >= maxPlayers) return; // Still full

      // Find first person on waitlist
      const q = query(
        collection(firestore, "match_participants"),
        where("matchId", "==", matchId),
        where("status", "==", "WAITLIST"),
        orderBy("updatedAt", "asc"),
        limit(1)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const waiterDoc = snapshot.docs[0];
        const waiter = waiterDoc.data();
        const waiterRef = doc(firestore, "match_participants", waiterDoc.id);

        // Promote to IN
        transaction.update(waiterRef, {
          status: 'IN',
          updatedAt: serverTimestamp()
        });

        // Increment player count
        transaction.update(matchRef, {
          playerCount: currentPlayerCount + 1
        });

        // Notify
        const notificationRef = doc(collection(firestore, "notifications"));
        // The notification must be sent as whoever freed the spot (security rules check the sender).
        const currentUserId = actorId ?? auth.currentUser?.uid;
        transaction.set(notificationRef, {
          userId: waiter.userId,
          senderId: currentUserId, // Required by security rules
          fromUserId: currentUserId,
          title: "Kadroya Girdin!",
          body: "Maçta yer açıldı ve otomatik olarak kadroya eklendin. İyi maçlar!",
          type: "match_join",
          matchId: matchId,
          read: false,
          createdAt: serverTimestamp()
        });
      }
    });
  } catch (e) {
    console.error("Error promoting from waitlist:", e);
  }
};

export const castMotmVote = async (matchId: string, voterId: string, votedForId: string) => {
  try {
    const matchRef = doc(db, "matches", matchId);

    // Use transaction to prevent duplicate votes and race conditions
    await runTransaction(db, async (transaction) => {
      const matchDoc = await transaction.get(matchRef);
      if (!matchDoc.exists()) throw new Error('Maç bulunamadı!');

      const matchData = matchDoc.data();
      const existingVotes = matchData.motmVotes || {};

      // Check if user already voted
      if (existingVotes[voterId]) {
        throw 'ALREADY_VOTED';
      }

      transaction.update(matchRef, {
        [`motmVotes.${voterId}`]: votedForId
      });
    });
  } catch (error) {
    if (error === 'ALREADY_VOTED') {
      throw new Error('Bu maç için zaten oy kullandınız.');
    }
    console.error("Error casting MOTM vote: ", error);
    throw error;
  }
};

export const getMatchParticipants = async (matchId: string) => {
  try {
    const q = query(collection(db, "match_participants"), where("matchId", "==", matchId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching participants: ", error);
    throw error;
  }
};

export const updateMatchParticipant = async (matchId: string, userId: string, data: any) => {
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new Error('Geçerli bir kullanıcı ID\'si sağlanmalıdır.');
    }
    if (!matchId || typeof matchId !== 'string' || matchId.trim() === '') {
      throw new Error('Geçerli bir maç ID\'si sağlanmalıdır.');
    }
    const participantRef = doc(db, "match_participants", `${matchId}_${userId}`);
    await updateDoc(participantRef, data);
  } catch (error) {
    console.error("Error updating participant: ", error);
    throw error;
  }
};

/**
 * STATS_DEADLINE: Check if the stats entry window is still open (24hrs from match end)
 */
export const isStatsWindowOpen = (matchDate: Date, matchDurationMinutes: number = 90): boolean => {
  const matchEnd = new Date(matchDate.getTime() + matchDurationMinutes * 60 * 1000);
  const deadline = new Date(matchEnd.getTime() + 24 * 60 * 60 * 1000);
  return new Date() < deadline;
};

/**
 * Get time remaining until stats deadline
 */
export const getStatsDeadlineRemaining = (matchDate: Date, matchDurationMinutes: number = 90): { hours: number; minutes: number; expired: boolean } => {
  const matchEnd = new Date(matchDate.getTime() + matchDurationMinutes * 60 * 1000);
  const deadline = new Date(matchEnd.getTime() + 24 * 60 * 60 * 1000); // 24 hours
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  if (diff <= 0) return { hours: 0, minutes: 0, expired: true };
  return {
    hours: Math.floor(diff / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    expired: false
  };
};

/**
 * ADMIN_CONSTRAINTS: Update match participant with admin self-edit restriction
 * Admin cannot edit their own stats — only other players' stats
 */
export const updateMatchParticipantWithConstraints = async (
  matchId: string,
  targetUserId: string,
  callerUserId: string,
  data: any
) => {
  try {
    // Get match to check admin status and stats window
    const matchDoc = await getDoc(doc(db, "matches", matchId));
    if (!matchDoc.exists()) throw new Error("Maç bulunamadı");

    const match = matchDoc.data();
    const matchDate = match.date?.toDate ? match.date.toDate() : new Date(match.date);

    // Check stats window
    if (!isStatsWindowOpen(matchDate)) {
      // After deadline, only admin can edit (and not their own)
      const isAdmin = match.creatorId === callerUserId;
      if (!isAdmin) {
        throw new Error("İstatistik giriş süresi doldu. Sadece admin düzeltme yapabilir.");
      }
    }

    // Admin self-edit restriction
    const isAdmin = match.creatorId === callerUserId;
    if (isAdmin && targetUserId === callerUserId) {
      // Admin can only enter their OWN stats like a regular player (goals, assists)
      // They cannot approve/modify their own stats through the admin panel
      const allowedSelfFields = ['goals', 'assists', 'saves', 'cleanSheet', 'cards', 'ownGoals', 'statsEntered'];
      const keys = Object.keys(data);
      const hasDisallowedField = keys.some(k => !allowedSelfFields.includes(k));
      if (hasDisallowedField) {
        throw new Error("Admin kendi istatistiklerini onay panelinden düzenleyemez.");
      }
    }

    const participantRef = doc(db, "match_participants", `${matchId}_${targetUserId}`);
    await updateDoc(participantRef, {
      ...data,
      lastUpdatedBy: callerUserId,
      lastUpdatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error updating participant with constraints: ", error);
    throw error;
  }
};

/**
 * STATS_DEADLINE: Auto-close stats for a match (set 0 for missing entries)
 */
export const autoCloseMatchStats = async (matchId: string) => {
  try {
    const participants = await getMatchParticipants(matchId);
    const batch = writeBatch(db);

    for (const p of participants as any[]) {
      if (!p.statsEntered && !p.statsSubmitted) {
        const participantRef = doc(db, "match_participants", `${matchId}_${p.userId}`);
        batch.update(participantRef, {
          goals: 0,
          assists: 0,
          saves: 0,
          cleanSheet: false,
          cards: 0,
          ownGoals: 0,
          statsEntered: true,
          autoFilled: true,
          statsClosedAt: serverTimestamp()
        });
      }
    }

    // Mark match stats as closed
    const matchRef = doc(db, "matches", matchId);
    batch.update(matchRef, { statsClosed: true });

    await batch.commit();
  } catch (error) {
    console.error("Error auto-closing match stats: ", error);
    throw error;
  }
};

/**
 * ADMIN_APPROVAL_PANEL: Get stats summary for admin approval
 */
export const getMatchStatsSummary = async (matchId: string) => {
  try {
    const participants = await getMatchParticipants(matchId);
    const matchDoc = await getDoc(doc(db, "matches", matchId));
    if (!matchDoc.exists()) throw new Error("Maç bulunamadı");

    const match = matchDoc.data();

    // Separate by team
    const teamA = participants.filter((p: any) => p.team === 'A');
    const teamB = participants.filter((p: any) => p.team === 'B');

    const teamAGoals = teamA.reduce((sum: number, p: any) => sum + (p.goals || 0), 0);
    const teamBGoals = teamB.reduce((sum: number, p: any) => sum + (p.goals || 0), 0);
    const teamAAssists = teamA.reduce((sum: number, p: any) => sum + (p.assists || 0), 0);
    const teamBAssists = teamB.reduce((sum: number, p: any) => sum + (p.assists || 0), 0);

    // Validation warnings
    const warnings: string[] = [];
    if (match.scoreA !== undefined && teamAGoals !== match.scoreA) {
      warnings.push(`Takım A: Oyuncular ${teamAGoals} gol girmiş ama skor ${match.scoreA}.`);
    }
    if (match.scoreB !== undefined && teamBGoals !== match.scoreB) {
      warnings.push(`Takım B: Oyuncular ${teamBGoals} gol girmiş ama skor ${match.scoreB}.`);
    }
    if (teamAAssists > teamAGoals) {
      warnings.push(`Takım A: Asist sayısı (${teamAAssists}) gol sayısından (${teamAGoals}) fazla olamaz.`);
    }
    if (teamBAssists > teamBGoals) {
      warnings.push(`Takım B: Asist sayısı (${teamBAssists}) gol sayısından (${teamBGoals}) fazla olamaz.`);
    }

    const missingEntries = participants.filter((p: any) => !p.statsEntered && !p.statsSubmitted);
    if (missingEntries.length > 0) {
      warnings.push(`${missingEntries.length} oyuncu henüz istatistik girmedi.`);
    }

    return {
      teamA: { players: teamA, totalGoals: teamAGoals, totalAssists: teamAAssists },
      teamB: { players: teamB, totalGoals: teamBGoals, totalAssists: teamBAssists },
      warnings,
      allEntered: missingEntries.length === 0,
      matchScore: { A: match.scoreA, B: match.scoreB }
    };
  } catch (error) {
    console.error("Error getting match stats summary: ", error);
    throw error;
  }
};

export const updateMatchPayment = async (matchId: string, userId: string, paid: boolean, amount?: number) => {
  try {
    const participantRef = doc(db, "match_participants", `${matchId}_${userId}`);
    const data: any = { paid };
    if (amount !== undefined) {
      data.paidAmount = amount;
    }
    await updateDoc(participantRef, data);
  } catch (error) {
    console.error("Error updating payment: ", error);
    throw error;
  }
};

export const updateMatchScore = async (matchId: string, scoreA: number, scoreB: number) => {
  try {
    const docRef = doc(db, "matches", matchId);
    await updateDoc(docRef, {
      scoreA,
      scoreB,
      status: 'FINISHED',
      endedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error updating match score: ", error);
    throw error;
  }
};

/**
 * Lock match stats - prevents further stat entry and signals MVP voting should begin
 */
export const lockMatchStats = async (matchId: string) => {
  try {
    const docRef = doc(db, "matches", matchId);
    await updateDoc(docRef, {
      status: 'STATS_LOCKED',
      statsLockedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error locking match stats: ", error);
    throw error;
  }
};

export const updatePlayerStats = async (matchId: string, userId: string, goals: number, assists: number, cleanSheet?: boolean, { firestore = db }: ServiceOptions = {}) => {
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new Error('Geçerli bir kullanıcı ID\'si sağlanmalıdır.');
    }
    if (!matchId || typeof matchId !== 'string' || matchId.trim() === '') {
      throw new Error('Geçerli bir maç ID\'si sağlanmalıdır.');
    }
    const participantRef = doc(firestore, "match_participants", `${matchId}_${userId}`);
    // statsEntered is what the 24h deadline job checks; without it entered stats were reset to 0.
    const updateData: any = {
      goals,
      assists,
      statsSubmitted: true,
      statsEntered: true,
      // Players enter their own line, so the author is always the player.
      statsEnteredBy: userId
    };
    // Add clean sheet for goalkeepers
    if (cleanSheet !== undefined) {
      updateData.isGoalkeeper = true;
      updateData.cleanSheet = cleanSheet;
    }
    await updateDoc(participantRef, updateData);
  } catch (error) {
    console.error("Error updating player stats: ", error);
    throw error;
  }
};

/**
 * Cancels a match by soft-deleting it: the document stays (history, stats integrity) but every
 * list hides it. Cloud Functions clear its notifications, invites, disputes and MVP voting.
 */
export const deleteMatch = async (matchId: string) => {
  try {
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await getDoc(matchRef);
    if (!matchSnap.exists()) throw new Error("Maç bulunamadı");
    const matchData = matchSnap.data();
    if (matchData.isDeleted) return;

    await updateDoc(matchRef, {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: auth.currentUser?.uid ?? null,
    });

    const participantsQuery = query(collection(db, "match_participants"), where("matchId", "==", matchId));
    const participantsSnapshot = await getDocs(participantsQuery);
    const currentUid = auth.currentUser?.uid;

    // Cancellation notices carry no matchId, so the server cleanup of match notifications keeps them.
    {
      const venue = matchData.venue || "Maç";
      let dateStr = "";
      if (matchData.date) {
        const d = matchData.date.toDate ? matchData.date.toDate() : new Date(matchData.date);
        dateStr = d.toLocaleDateString("tr-TR") + " saat " + d.toLocaleTimeString("tr-TR", { hour: '2-digit', minute: '2-digit' });
      }

      const notifyPromises = participantsSnapshot.docs
        .map((doc) => doc.data())
        .filter((p) => p.userId && !p.userId.startsWith("guest_") && p.userId !== currentUid && p.status !== 'OUT')
        .map((p) => {
          return saveNotification({
            userId: p.userId,
            title: "Maç İptal Edildi",
            body: `${dateStr ? dateStr + ' tarihindeki ' : ''}${venue} maçı iptal edilmiştir.`,
            type: "general",
            groupId: matchData.groupId || undefined,
            read: false,
          });
        });

      // The match is already cancelled; a failed notice must not report the cancel as failed.
      await Promise.allSettled(notifyPromises);
    }
  } catch (error) {
    console.error("Error deleting match: ", error);
    throw error;
  }
};
