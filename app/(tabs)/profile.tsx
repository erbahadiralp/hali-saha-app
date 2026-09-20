import { useLocalSearchParams } from 'expo-router';
import ProfileView from '../../components/profile/ProfileView';

/** Signed-in user's profile tab. Shares its screen with /user/[id]. */
export default function ProfileTab() {
   const { groupId } = useLocalSearchParams<{ groupId?: string }>();
   return <ProfileView groupId={groupId} isTabRoot />;
}
