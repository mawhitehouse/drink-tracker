import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// 1. THE REGION OPTIONS
const REGIONS = ['NZ/AU', 'WHO Baseline', 'UK', 'USA'];

export default function ProfileScreen() {
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [gender, setGender] = useState('');
  // 2. NEW STATE for Region (defaults to NZ/AU)
  const [region, setRegion] = useState('NZ/AU');

  useEffect(() => {
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    try {
      const savedWeight = await AsyncStorage.getItem('userWeight');
      const savedHeight = await AsyncStorage.getItem('userHeight');
      const savedGender = await AsyncStorage.getItem('userGender');
      const savedRegion = await AsyncStorage.getItem('userRegion'); // Load region
      
      if (savedWeight !== null) setWeight(savedWeight);
      if (savedHeight !== null) setHeight(savedHeight);
      if (savedGender !== null) setGender(savedGender);
      if (savedRegion !== null) setRegion(savedRegion);
    } catch (error) {
      Alert.alert('Error', 'Failed to load profile data.');
    }
  };

  const saveProfileData = async () => {
    try {
      await AsyncStorage.setItem('userWeight', weight);
      await AsyncStorage.setItem('userHeight', height);
      await AsyncStorage.setItem('userGender', gender);
      await AsyncStorage.setItem('userRegion', region); // Save region
      
      Alert.alert('Success', 'Profile saved to your phone!');
    } catch (error) {
      Alert.alert('Error', 'Something went wrong saving the data.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>User Profile</Text>

      <Text style={styles.label}>Weight (kg):</Text>
      <TextInput style={styles.input} placeholder="e.g. 74" keyboardType="numeric" value={weight} onChangeText={setWeight} />

      <Text style={styles.label}>Height (cm):</Text>
      <TextInput style={styles.input} placeholder="e.g. 180" keyboardType="numeric" value={height} onChangeText={setHeight} />

      <Text style={styles.label}>Gender (M/F):</Text>
      <TextInput style={styles.input} placeholder="M or F" value={gender} onChangeText={setGender} />

      {/* 3. THE REGION SELECTOR UI */}
      <Text style={styles.label}>Standard Drink Region:</Text>
      <View style={styles.grid}>
        {REGIONS.map((r) => (
          <TouchableOpacity 
            key={r} 
            // If the button matches our current state, we give it a blue "active" style!
            style={[styles.regionButton, region === r && styles.activeRegionButton]}
            onPress={() => setRegion(r)}
          >
            <Text style={[styles.regionText, region === r && styles.activeRegionText]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Button title="Save Profile" onPress={saveProfileData} color="#007BFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 30, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 30, textAlign: 'center' },
  label: { fontSize: 16, marginBottom: 8, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: '#cccccc', padding: 12, marginBottom: 20, borderRadius: 8, fontSize: 16 },
  
  // Styles for our new Region Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  regionButton: { width: '48%', paddingVertical: 12, borderRadius: 8, backgroundColor: '#e9ecef', marginBottom: 10, alignItems: 'center' },
  activeRegionButton: { backgroundColor: '#007BFF' }, // Turns blue when selected
  regionText: { color: '#495057', fontWeight: 'bold' },
  activeRegionText: { color: '#ffffff' } // Text turns white when selected
});