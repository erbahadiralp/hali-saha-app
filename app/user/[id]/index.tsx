import { useLocalSearchParams } from 'expo-router';
import ProfileView from '../../../components/profile/ProfileView';

/** Any player's profile; shows edit controls when it is the signed-in user's own. */
export default function UserProfileScreen() {
    const { id, groupId } = useLocalSearchParams<{ id: string; groupId?: string }>();
    return <ProfileView userId={id} groupId={groupId} />;
}
