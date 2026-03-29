import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { Alert, Button, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Drink = {
  id: string;
  name: string;
  volume: number;
  abv: number;
  startTime: number;
  endTime: number | null;
  stomachContent?: number;    
};

const REGIONS = ['NZ/AU', 'WHO Baseline', 'UK', 'USA'];

export default function ProfileScreen() {
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [gender, setGender] = useState('');
  const [region, setRegion] = useState('NZ/AU');

  useEffect(() => {
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    try {
      const savedWeight = await AsyncStorage.getItem('userWeight');
      const savedHeight = await AsyncStorage.getItem('userHeight');
      const savedGender = await AsyncStorage.getItem('userGender');
      const savedRegion = await AsyncStorage.getItem('userRegion'); 
      
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
      await AsyncStorage.setItem('userRegion', region); 
      
      Alert.alert('Success', 'Profile saved to your phone!');
    } catch (error) {
      Alert.alert('Error', 'Something went wrong saving the data.');
    }
  };

  const convertToCSV = (drinks: Drink[]) => {
    const header = "id,name,volume,abv,startTime,endTime,stomachContent\n";
    const rows = drinks.map(d => {
      const safeName = d.name ? d.name.replace(/,/g, '') : 'Unknown Drink';
      const eTime = d.endTime ? d.endTime : '';
      const stomach = d.stomachContent !== undefined ? d.stomachContent : '';
      return `${d.id},${safeName},${d.volume},${d.abv},${d.startTime},${eTime},${stomach}`;
    });
    return header + rows.join('\n');
  };

  const parseCSV = (csvString: string): Drink[] => {
    const lines = csvString.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return []; 

    // --- NEW: Universal Time Translator ---
    const parseTime = (timeStr: string) => {
      if (!timeStr) return null;
      
      // Strip out any rogue single or double quotes from the spreadsheet
      const cleanStr = timeStr.replace(/['"]/g, '').trim(); 
      if (!cleanStr) return null;

      // If it looks like a human date (has dashes or colons)
      if (cleanStr.includes('-') || cleanStr.includes(':')) {
        const parsedMs = new Date(cleanStr).getTime();
        return isNaN(parsedMs) ? null : parsedMs;
      }
      
      // Otherwise, assume it's already Unix milliseconds
      const parsedNum = parseInt(cleanStr, 10);
      return isNaN(parsedNum) ? null : parsedNum;
    };

    const drinks: Drink[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length >= 5) { 
        drinks.push({
          id: cols[0] || Date.now().toString() + i,
          name: cols[1] || 'Imported Drink',
          volume: parseFloat(cols[2]) || 0,
          abv: parseFloat(cols[3]) || 0,
          startTime: parseTime(cols[4]) || Date.now(),
          endTime: parseTime(cols[5]),
          stomachContent: cols[6] ? parseFloat(cols[6]) : 0,
        });
      }
    }
    return drinks;
  };

  const exportData = async () => {
    try {
      const savedDrinksData = await AsyncStorage.getItem('drinkHistory');
      if (!savedDrinksData || savedDrinksData === '[]') {
        Alert.alert('Nothing to Export', 'You have no logged drinks in your history.');
        return;
      }
      
      const parsedDrinks = JSON.parse(savedDrinksData);
      const csvString = convertToCSV(parsedDrinks);
      
      // @ts-ignore
      const fileUri = FileSystem.cacheDirectory + `AlcoholTracker_Backup_${Date.now()}.csv`;
      
      await FileSystem.writeAsStringAsync(fileUri, csvString);
      
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (error) {
      console.error("Export Error:", error); // <-- This will print the exact crash reason in your terminal
      Alert.alert('Error', 'Could not export data.');
    }
  };

  const importData = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], 
        copyToCacheDirectory: true,
      });

      if (result.canceled === false && result.assets && result.assets.length > 0) {
        const fileUri = result.assets[0].uri;
        
        // 2. TS FIX: Use the raw string 'utf8' here as well
        const fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: 'utf8' });
        
        const newDrinks = parseCSV(fileContent);
        
        if (newDrinks.length > 0) {
          Alert.alert(
            "Import CSV",
            `Found ${newDrinks.length} drinks. Do you want to overwrite your existing data, or merge this with your current history?`,
            [
              { text: "Cancel", style: "cancel" },
              { 
                text: "Overwrite", 
                style: "destructive",
                onPress: async () => {
                  await AsyncStorage.setItem('drinkHistory', JSON.stringify(newDrinks));
                  Alert.alert("Success", "Data overwritten successfully!");
                }
              },
              { 
                text: "Merge", 
                onPress: async () => {
                  const currentData = await AsyncStorage.getItem('drinkHistory');
                  const currentArray = currentData ? JSON.parse(currentData) : [];
                  
                  const mergedArray = [...currentArray, ...newDrinks];
                  const uniqueArray = Array.from(new Map(mergedArray.map((item: Drink) => [item.id, item])).values());
                  
                  await AsyncStorage.setItem('drinkHistory', JSON.stringify(uniqueArray));
                  Alert.alert("Success", `Data merged! Total drinks: ${uniqueArray.length}`);
                }
              }
            ]
          );
        } else {
          Alert.alert('Invalid File', 'Could not read any valid drink rows from this CSV.');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Could not import data. Make sure it is a valid CSV file.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.title}>User Profile</Text>

      <Text style={styles.label}>Weight (kg):</Text>
      <TextInput style={styles.input} placeholder="e.g. 74" keyboardType="numeric" value={weight} onChangeText={setWeight} />

      <Text style={styles.label}>Height (cm):</Text>
      <TextInput style={styles.input} placeholder="e.g. 180" keyboardType="numeric" value={height} onChangeText={setHeight} />

      <Text style={styles.label}>Gender (M/F):</Text>
      <TextInput style={styles.input} placeholder="M or F" value={gender} onChangeText={setGender} />

      <Text style={styles.label}>Standard Drink Region:</Text>
      <View style={styles.grid}>
        {REGIONS.map((r) => (
          <TouchableOpacity 
            key={r} 
            style={[styles.regionButton, region === r && styles.activeRegionButton]}
            onPress={() => setRegion(r)}
          >
            <Text style={[styles.regionText, region === r && styles.activeRegionText]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Button title="Save Profile" onPress={saveProfileData} color="#007BFF" />

      <View style={styles.dataSection}>
        <Text style={styles.dataTitle}>Data Management</Text>
        <Text style={styles.dataDescription}>
          Export your drink history to a spreadsheet (.csv) for safekeeping, or import historical data.
        </Text>
        
        <View style={styles.dataButtons}>
          <TouchableOpacity style={styles.exportButton} onPress={exportData}>
            <Text style={styles.dataButtonText}>📤 Export CSV</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.importButton} onPress={importData}>
            <Text style={styles.dataButtonText}>📥 Import CSV</Text>
          </TouchableOpacity>
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 30, backgroundColor: '#fff', paddingTop: 60 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 30, textAlign: 'center' },
  label: { fontSize: 16, marginBottom: 8, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: '#cccccc', padding: 12, marginBottom: 20, borderRadius: 8, fontSize: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  regionButton: { width: '48%', paddingVertical: 12, borderRadius: 8, backgroundColor: '#e9ecef', marginBottom: 10, alignItems: 'center' },
  activeRegionButton: { backgroundColor: '#007BFF' }, 
  regionText: { color: '#495057', fontWeight: 'bold' },
  activeRegionText: { color: '#ffffff' },
  dataSection: { marginTop: 40, paddingTop: 20, borderTopWidth: 1, borderColor: '#e9ecef' },
  dataTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  dataDescription: { fontSize: 14, color: '#6c757d', marginBottom: 20, lineHeight: 20 },
  dataButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  exportButton: { backgroundColor: '#28a745', padding: 15, borderRadius: 8, width: '48%', alignItems: 'center' },
  importButton: { backgroundColor: '#17a2b8', padding: 15, borderRadius: 8, width: '48%', alignItems: 'center' },
  dataButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 }
});