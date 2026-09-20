import { Redirect } from 'expo-router';

// This is a placeholder screen for the FAB button in the tab bar
// The actual create-match screen is at /create-match
export default function CreatePlaceholder() {
    return <Redirect href="/create-match" />;
}
