import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';

// 1. Tell the app how to handle notifications when you are actively using it
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, // <-- Replaces shouldShowAlert
    shouldShowList: true,   // <-- Replaces shouldShowAlert
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  
  useEffect(() => {
    setupNotifications();
  }, []);

  const setupNotifications = async () => {
    // 2. Ask the user for permission to send notifications
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      Alert.alert(
        'Permissions Required', 
        'Please enable notifications in your settings so the app can track your active drinks.'
      );
      return;
    }

    // 3. Create the "Active Drink" template with TWO custom buttons
    await Notifications.setNotificationCategoryAsync('ACTIVE_DRINK', [
      {
        identifier: 'FINISH_DRINK',
        buttonTitle: 'Finish Drink 🏁',
        options: {
          opensAppToForeground: false, 
        },
      },
      {
        identifier: 'FINISH_AND_NEW',
        buttonTitle: 'Same Again 🍻', // Renamed for clarity!
        options: {
          opensAppToForeground: false, // MAGIC: Now stays in the background!
        },
      },
    ]);
  };

  return (
    <Stack>
      {/* This loads your bottom navigation bar */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}