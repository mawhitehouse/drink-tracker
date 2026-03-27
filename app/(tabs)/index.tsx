import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Alert, Button, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Drink = {
  id: string;
  name: string;
  volume: number;
  abv: number;
  startTime: number;
  endTime: number | null;
};

const PRESET_DRINKS = [
  { name: 'Standard Beer', volume: '330', abv: '5.0' },
  { name: 'Cocktail', volume: '200', abv: '15.0' },
  { name: 'Glass of Wine', volume: '150', abv: '12.5' },
  { name: 'Shot (Spirits)', volume: '30', abv: '40.0' },
];

const calculateStandardDrinks = (volume: number, abv: number, region: string) => {
  const gramsOfAlcohol = volume * (abv / 100) * 0.789;
  let divider = 10; 
  if (region === 'UK') divider = 8;
  if (region === 'USA') divider = 14;
  return (gramsOfAlcohol / divider).toFixed(1); 
};

export default function DashboardScreen() {
  const [consumedDrinks, setConsumedDrinks] = useState<Drink[]>([]);
  const [userRegion, setUserRegion] = useState('NZ/AU');
  
  const [userWeight, setUserWeight] = useState(0);
  const [userGender, setUserGender] = useState('M');
  const [currentBAC, setCurrentBAC] = useState('0.000');
  const [bacColor, setBacColor] = useState('#28a745'); 
  
  const [drivingLimit, setDrivingLimit] = useState(0.05);
  const [timeToSober, setTimeToSober] = useState('0h 0m (Sober)');

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [drinkName, setDrinkName] = useState(''); 
  const [drinkVolume, setDrinkVolume] = useState('');
  const [drinkAbv, setDrinkAbv] = useState('');

  useEffect(() => {
    loadDrinksAndSettings();
  }, []);

  useEffect(() => {
    updateBACDisplay();
    const interval = setInterval(() => {
      updateBACDisplay();
    }, 60000);
    return () => clearInterval(interval);
  }, [consumedDrinks, userWeight, userGender, userRegion]); 

  const loadDrinksAndSettings = async () => {
    try {
      const savedDrinks = await AsyncStorage.getItem('drinkHistory');
      const savedRegion = await AsyncStorage.getItem('userRegion');
      const savedWeight = await AsyncStorage.getItem('userWeight');
      const savedGender = await AsyncStorage.getItem('userGender');
      
      if (savedDrinks !== null) setConsumedDrinks(JSON.parse(savedDrinks));
      if (savedRegion !== null) setUserRegion(savedRegion);
      if (savedWeight !== null) setUserWeight(parseFloat(savedWeight));
      if (savedGender !== null) setUserGender(savedGender);
    } catch (error) {
      Alert.alert('Error', 'Could not load data.');
    }
  };

  const updateBACDisplay = () => {
    let limit = 0.05; 
    if (userRegion === 'UK' || userRegion === 'USA') limit = 0.08;
    setDrivingLimit(limit);

    if (consumedDrinks.length === 0 || userWeight === 0) {
      setCurrentBAC('0.000');
      setBacColor('#28a745'); 
      setTimeToSober('0h 0m (Sober)');
      return;
    }

    const r = userGender.toUpperCase().startsWith('F') ? 0.55 : 0.68;
    const bacPerGram = 1 / (userWeight * r * 10);
    const burnPerMinute = 0.015 / 60; 

    let earliestTime = Date.now();
    let totalGrams = 0;
    
    consumedDrinks.forEach(d => { 
      if (d.startTime < earliestTime) earliestTime = d.startTime; 
      totalGrams += d.volume * (d.abv / 100) * 0.789;
    });

    let simulatedBAC = 0;
    const now = Date.now();

    for (let time = earliestTime; time <= now; time += 60000) {
      let absorbedThisMinute = 0;
      consumedDrinks.forEach(drink => {
        const drinkingDurationMs = drink.endTime ? (drink.endTime - drink.startTime) : (30 * 60000);
        const totalAbsorptionTimeMs = drinkingDurationMs + (30 * 60000); 
        const totalAbsorptionMinutes = totalAbsorptionTimeMs / 60000;
        const grams = drink.volume * (drink.abv / 100) * 0.789;
        const bacContributionPerMinute = (grams * bacPerGram) / totalAbsorptionMinutes;

        if (time >= drink.startTime && time < (drink.startTime + totalAbsorptionTimeMs)) {
          absorbedThisMinute += bacContributionPerMinute;
        }
      });

      simulatedBAC += absorbedThisMinute;
      simulatedBAC -= burnPerMinute;
      if (simulatedBAC < 0) simulatedBAC = 0; 
    }

    setCurrentBAC(simulatedBAC.toFixed(3));

    const totalPossibleBAC = totalGrams * bacPerGram;
    const minutesSinceStart = (now - earliestTime) / 60000;
    const totalBurned = minutesSinceStart * burnPerMinute;
    const remainingBACToBurn = totalPossibleBAC - totalBurned;

    if (remainingBACToBurn <= 0) {
      setTimeToSober('0h 0m (Sober)');
    } else {
      const remainingMinutes = remainingBACToBurn / burnPerMinute;
      const hours = Math.floor(remainingMinutes / 60);
      const mins = Math.floor(remainingMinutes % 60);
      const soberTimeMs = now + (remainingMinutes * 60000);
      const soberTimeString = new Date(soberTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setTimeToSober(`${hours}h ${mins}m (${soberTimeString})`);
    }

    if (simulatedBAC < limit * 0.5) {
      setBacColor('#28a745'); 
    } else if (simulatedBAC < limit) {
      setBacColor('#ffc107'); 
    } else if (simulatedBAC < limit * 2) {
      setBacColor('#dc3545'); 
    } else {
      setBacColor('#d63384'); 
    }
  };

  const logCustomDrink = async () => {
    const newDrink = {
      id: Date.now().toString(), 
      name: drinkName || 'Unknown Drink', 
      volume: parseFloat(drinkVolume) || 0, 
      abv: parseFloat(drinkAbv) || 0,    
      startTime: Date.now(),     
      endTime: null,             
    };
    const updatedDrinksList = [...consumedDrinks, newDrink];
    setConsumedDrinks(updatedDrinksList);
    try {
      await AsyncStorage.setItem('drinkHistory', JSON.stringify(updatedDrinksList));
      setDrinkName(''); setDrinkVolume(''); setDrinkAbv(''); setIsModalVisible(false);
    } catch (error) {}
  };

  const finishDrink = async (drinkId: string) => {
    const updatedList = consumedDrinks.map(drink => {
      if (drink.id === drinkId) return { ...drink, endTime: Date.now() }; 
      return drink;
    });
    setConsumedDrinks(updatedList);
    try { await AsyncStorage.setItem('drinkHistory', JSON.stringify(updatedList)); } 
    catch (error) {}
  };

  const deleteDrink = (idToDelete: string) => {
    Alert.alert("Delete Drink", "Are you sure you want to remove this entry?", [
      { text: "Cancel", style: "cancel" }, 
      { text: "Delete", style: "destructive", onPress: async () => {
          const updatedList = consumedDrinks.filter(drink => drink.id !== idToDelete);
          setConsumedDrinks(updatedList);
          try { await AsyncStorage.setItem('drinkHistory', JSON.stringify(updatedList)); } 
          catch (error) {}
        }
      }
    ]);
  };

  const renderDrinkItem = ({ item }: { item: Drink }) => {
    const startString = item.startTime ? new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown';
    const endString = item.endTime ? new Date(item.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Drinking...';
    const stdDrinks = calculateStandardDrinks(item.volume, item.abv, userRegion);

    return (
      <TouchableOpacity onLongPress={() => deleteDrink(item.id)} delayLongPress={500}>
        <View style={[styles.drinkCard, item.endTime === null && styles.activeDrinkCard]}>
          <Text style={styles.drinkName}>{item.name}</Text>
          <Text style={styles.drinkDetails}>{item.volume}ml • {item.abv}% ABV • {stdDrinks} Std Drinks</Text>
          <Text style={styles.timeDetails}>Started: {startString} {item.endTime ? `• Finished: ${endString}` : ''}</Text>
          {item.endTime === null && (
            <View style={styles.finishButtonContainer}>
              <Button title="Finish Drink" color="#ff9800" onPress={() => finishDrink(item.id)} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const applyPreset = (presetName: string, presetVolume: string, presetAbv: string) => {
    setDrinkName(presetName); setDrinkVolume(presetVolume); setDrinkAbv(presetAbv);
  };

  // 1. REVERSE THE ORDER: Sort the array so the newest drinks are always at the top
  const sortedDrinks = [...consumedDrinks].sort((a, b) => b.startTime - a.startTime);

  // 2. CHECK FOR UNFINISHED DRINKS: Count how many drinks have a null endTime
  const activeDrinkCount = consumedDrinks.filter(drink => drink.endTime === null).length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Drink Dashboard</Text>
      
      <View style={styles.bacContainer}>
        <Text style={styles.bacLabel}>Estimated BAC</Text>
        <Text style={[styles.bacNumber, { color: bacColor }]}>{currentBAC}%</Text>
        
        <View style={styles.bacDetailsRow}>
          <Text style={styles.bacDetailText}>Limit: {drivingLimit.toFixed(2)}%</Text>
          <Text style={styles.bacDetailTextDivider}>|</Text>
          <Text style={styles.bacDetailText}>Sober in: {timeToSober}</Text>
        </View>
      </View>

      <Button title="+ Add Drink" onPress={() => setIsModalVisible(true)} color="#007BFF" />
      
      <Text style={styles.subtitle}>Drinks Today:</Text>
      
      {/* 3. SHOW WARNING: Only displays if you have at least 1 unfinished drink */}
      {activeDrinkCount > 0 && (
        <View style={styles.activeWarningBanner}>
          <Text style={styles.activeWarningText}>
            ⚠️ You have {activeDrinkCount} unfinished drink{activeDrinkCount > 1 ? 's' : ''}
          </Text>
        </View>
      )}

      <Text style={styles.hintText}>(Press and hold a drink to delete it)</Text>

      {/* 4. FEED THE REVERSED LIST INTO THE FLATLIST */}
      <FlatList 
        data={sortedDrinks} 
        keyExtractor={(item) => item.id} 
        renderItem={renderDrinkItem} 
        style={styles.list} 
      />

      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log a Drink</Text>
            <Text style={styles.label}>Quick Select:</Text>
            <View style={styles.presetGrid}>
              {PRESET_DRINKS.map((drink, index) => (
                <TouchableOpacity key={index} style={styles.presetButton} onPress={() => applyPreset(drink.name, drink.volume, drink.abv)}>
                  <Text style={styles.presetText}>{drink.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Drink Name:</Text>
            <TextInput style={styles.input} value={drinkName} onChangeText={setDrinkName} placeholder="e.g. Beer" />
            <Text style={styles.label}>Volume (ml):</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={drinkVolume} onChangeText={setDrinkVolume} placeholder="e.g. 330" />
            <Text style={styles.label}>ABV (%):</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={drinkAbv} onChangeText={setDrinkAbv} placeholder="e.g. 5.0" />
            <View style={styles.modalButtonRow}>
              <Button title="Cancel" color="#dc3545" onPress={() => setIsModalVisible(false)} />
              <Button title="Log Drink" color="#28a745" onPress={logCustomDrink} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8f9fa' },
  title: { fontSize: 24, fontWeight: 'bold', marginTop: 30, textAlign: 'center' },
  bacContainer: { backgroundColor: '#343a40', padding: 20, borderRadius: 15, alignItems: 'center', marginBottom: 20, marginTop: 10 },
  bacLabel: { color: '#adb5bd', fontSize: 16, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  bacNumber: { fontSize: 48, fontWeight: 'bold', marginTop: 5 },
  bacDetailsRow: { flexDirection: 'row', marginTop: 10, alignItems: 'center' },
  bacDetailText: { color: '#ced4da', fontSize: 14, fontWeight: '500' },
  bacDetailTextDivider: { color: '#6c757d', fontSize: 14, marginHorizontal: 10 },
  subtitle: { fontSize: 18, fontWeight: 'bold', marginTop: 25, marginBottom: 5 },
  hintText: { fontSize: 12, color: '#888', marginBottom: 10, fontStyle: 'italic' },
  
  // New Styles for the Warning Banner
  activeWarningBanner: { backgroundColor: '#fff3cd', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, marginBottom: 5, borderWidth: 1, borderColor: '#ffe69c' },
  activeWarningText: { color: '#856404', fontWeight: 'bold', fontSize: 14, textAlign: 'center' },

  list: { flex: 1 },
  drinkCard: { backgroundColor: '#ffffff', padding: 15, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#e0e0e0' },
  activeDrinkCard: { borderColor: '#ff9800', borderWidth: 2, backgroundColor: '#fff9e6' },
  drinkName: { fontSize: 18, fontWeight: 'bold' },
  drinkDetails: { fontSize: 14, color: '#666666', marginTop: 5 },
  timeDetails: { fontSize: 14, color: '#17a2b8', marginTop: 5, fontWeight: '500' },
  finishButtonContainer: { marginTop: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 15, width: '85%' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  label: { fontSize: 16, marginBottom: 5, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: '#cccccc', padding: 10, marginBottom: 15, borderRadius: 8, fontSize: 16 },
  modalButtonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 15 },
  presetButton: { backgroundColor: '#e9ecef', width: '48%', paddingVertical: 12, borderRadius: 8, marginBottom: 10, alignItems: 'center' },
  presetText: { color: '#495057', fontWeight: 'bold' }
});