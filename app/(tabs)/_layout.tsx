import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#007BFF' }}>
      
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'Dashboard', 
          tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} /> 
        }} 
      />
      
      <Tabs.Screen 
        name="stats" 
        options={{ 
          title: 'Stats', 
          tabBarIcon: ({ color }) => <Ionicons name="bar-chart" size={24} color={color} /> 
        }} 
      />

      <Tabs.Screen 
        name="profile" 
        options={{ 
          title: 'Profile', 
          tabBarIcon: ({ color }) => <Ionicons name="person" size={24} color={color} /> 
        }} 
      />

    </Tabs>
  );
}