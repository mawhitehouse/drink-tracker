import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useState } from 'react';
import { Alert, Button, Dimensions, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

type Drink = {
  id: string;
  name: string;
  volume: number;
  abv: number;
  startTime: number;
  endTime: number | null;
  consumedWithFood?: boolean; 
  stomachContent?: number;    
};

const PRESET_DRINKS = [
  { name: 'Standard Beer', volume: '330', abv: '5.0' },
  { name: 'Cocktail', volume: '200', abv: '15.0' },
  { name: 'Glass of Wine', volume: '150', abv: '12.5' },
  { name: 'Shot (Spirits)', volume: '30', abv: '40.0' },
];

const screenWidth = Dimensions.get('window').width;

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
  const [projectedPeak, setProjectedPeak] = useState('0.000');

  const [bacChartData, setBacChartData] = useState<{labels: string[], datasets: {data: number[], color?: any, withDots?: boolean}[]}>({
    labels: ['Now'], datasets: [{ data: [0] }]
  });

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false); 

  const [drinkName, setDrinkName] = useState(''); 
  const [drinkVolume, setDrinkVolume] = useState('');
  const [drinkAbv, setDrinkAbv] = useState('');
  const [stomachContent, setStomachContent] = useState(0);

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

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const actionId = response.actionIdentifier;
      const drinkId = response.notification.request.content.data?.drinkId as string; 
      if (!drinkId) return;

      if (actionId === 'FINISH_DRINK') {
        finishDrink(drinkId);
      } else if (actionId === 'FINISH_AND_NEW') {
        finishAndRepeatDrink(drinkId);
      }
    });
    return () => subscription.remove();
  }, []);

  const loadDrinksAndSettings = async () => {
    try {
      const savedDrinks = await AsyncStorage.getItem('drinkHistory');
      const savedRegion = await AsyncStorage.getItem('userRegion');
      const savedWeight = await AsyncStorage.getItem('userWeight');
      const savedGender = await AsyncStorage.getItem('userGender');
      
      if (savedDrinks) setConsumedDrinks(JSON.parse(savedDrinks));
      if (savedRegion) setUserRegion(savedRegion);
      if (savedWeight) setUserWeight(parseFloat(savedWeight));
      if (savedGender) setUserGender(savedGender);
    } catch (error) {}
  };

  const updateBACDisplay = () => {
    let limit = 0.05; 
    if (userRegion === 'UK' || userRegion === 'USA') limit = 0.08;
    setDrivingLimit(limit);

    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentDrinks = consumedDrinks.filter(d => {
      const endTimeToUse = d.endTime ? d.endTime : Date.now();
      return endTimeToUse > twentyFourHoursAgo;
    });

    if (recentDrinks.length === 0) {
      setCurrentBAC('0.000');
      setProjectedPeak('0.000');
      setBacColor('#28a745'); 
      setTimeToSober('0h 0m (Sober)');
      setBacChartData({ labels: ['Now'], datasets: [{ data: [0] }] });
      return;
    }

    const weightToUse = userWeight > 0 ? userWeight : 75;
    const r = userGender.toUpperCase().startsWith('F') ? 0.55 : 0.68;
    const bacPerGram = 1 / (weightToUse * r * 10);
    const burnPerMinute = 0.015 / 60; 

    let earliestTime = recentDrinks[0].startTime;
    let latestAbsorptionTime = earliestTime; 
    let totalGrams = 0;
    
    recentDrinks.forEach(d => { 
      if (d.startTime < earliestTime) earliestTime = d.startTime; 
      totalGrams += d.volume * (d.abv / 100) * 0.789;

      const stomachVal = d.stomachContent !== undefined ? d.stomachContent : (d.consumedWithFood ? 1 : 0);
      const absorptionDelayMins = 30 + (stomachVal * 60);
      const drinkingDurationMs = d.endTime ? (d.endTime - d.startTime) : (30 * 60000);
      const finishAbsorbing = d.startTime + drinkingDurationMs + (absorptionDelayMins * 60000);
      
      if (finishAbsorbing > latestAbsorptionTime) latestAbsorptionTime = finishAbsorbing;
    });

    let simulatedBAC = 0;
    let currentActualBAC = 0;
    let peakSimulatedBAC = 0;
    const now = Date.now();
    const loopEnd = Math.max(now, latestAbsorptionTime);

    const minuteByMinuteMap = new Map<number, number>();

    for (let time = earliestTime; time <= loopEnd; time += 60000) {
      let absorbedThisMinute = 0;
      recentDrinks.forEach(drink => {
        const stomachVal = drink.stomachContent !== undefined ? drink.stomachContent : (drink.consumedWithFood ? 1 : 0);
        const absorptionDelayMins = 30 + (stomachVal * 60);
        const drinkingDurationMs = drink.endTime ? (drink.endTime - drink.startTime) : (30 * 60000);
        const totalAbsorptionTimeMs = drinkingDurationMs + (absorptionDelayMins * 60000); 
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
      if (simulatedBAC > peakSimulatedBAC) peakSimulatedBAC = simulatedBAC;
      if (time <= now) currentActualBAC = simulatedBAC;

      minuteByMinuteMap.set(Math.floor(time / 60000) * 60000, simulatedBAC);
    }

    let newColor = '#28a745';
    if (currentActualBAC >= limit * 0.5 && currentActualBAC < limit) newColor = '#ffc107'; 
    if (currentActualBAC >= limit && currentActualBAC < limit * 2) newColor = '#dc3545'; 
    if (currentActualBAC >= limit * 2) newColor = '#d63384'; 
    
    setBacColor(newColor);
    setCurrentBAC(currentActualBAC.toFixed(3));
    setProjectedPeak(peakSimulatedBAC.toFixed(3)); 

    const totalPossibleBAC = totalGrams * bacPerGram;
    const minutesSinceStart = (now - earliestTime) / 60000;
    const totalBurned = minutesSinceStart * burnPerMinute;
    const remainingBACToBurn = totalPossibleBAC - totalBurned;
    let finalSoberTimeMs = now;

    if (remainingBACToBurn <= 0) {
      setTimeToSober('0h 0m (Sober)');
    } else {
      const remainingMinutes = remainingBACToBurn / burnPerMinute;
      const hours = Math.floor(remainingMinutes / 60);
      const mins = Math.floor(remainingMinutes % 60);
      finalSoberTimeMs = now + (remainingMinutes * 60000);
      const soberTimeString = new Date(finalSoberTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setTimeToSober(`${hours}h ${mins}m (${soberTimeString})`);
    }

    if (remainingBACToBurn > 0 || currentActualBAC > 0) {
      let tailBAC = simulatedBAC;
      for (let time = loopEnd + 60000; time <= finalSoberTimeMs; time += 60000) {
        tailBAC = Math.max(0, tailBAC - burnPerMinute);
        minuteByMinuteMap.set(Math.floor(time / 60000) * 60000, tailBAC);
      }

      const totalDurationMs = finalSoberTimeMs - earliestTime;
      const stepMs = Math.max(60000, totalDurationMs / 5); 
      
      let labels: string[] = [];
      let data: number[] = [];
      let limitLineData: number[] = [];

      for (let i = 0; i <= 5; i++) {
        const pointTime = earliestTime + (stepMs * i);
        const roundedTime = Math.floor(pointTime / 60000) * 60000;
        const bacAtPoint = minuteByMinuteMap.get(roundedTime) || 0;
        
        labels.push(new Date(roundedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        data.push(parseFloat(bacAtPoint.toFixed(3)));
        limitLineData.push(limit); // Generate the horizontal line!
      }
      
      setBacChartData({ 
        labels, 
        datasets: [
          { data: data, color: () => newColor }, 
          { data: limitLineData, color: () => `rgba(150, 150, 150, 0.7)`, withDots: false } 
        ] 
      });
    } else {
      setBacChartData({ labels: ['Now'], datasets: [{ data: [0] }] });
    }
  };

  const logCustomDrink = async () => {
    const newDrinkId = Date.now().toString(); 
    const newDrink = {
      id: newDrinkId, name: drinkName || 'Unknown Drink', volume: parseFloat(drinkVolume) || 0, abv: parseFloat(drinkAbv) || 0, startTime: Date.now(), endTime: null, stomachContent: stomachContent 
    };
    
    const updatedDrinksList = [...consumedDrinks, newDrink];
    setConsumedDrinks(updatedDrinksList);
    try {
      await AsyncStorage.setItem('drinkHistory', JSON.stringify(updatedDrinksList));
      setDrinkName(''); setDrinkVolume(''); setDrinkAbv(''); setStomachContent(0); 
      setIsModalVisible(false);

      await Notifications.scheduleNotificationAsync({
        content: { title: "🍺 Active Drink", body: `Drinking: ${newDrink.name}.`, categoryIdentifier: 'ACTIVE_DRINK', data: { drinkId: newDrinkId }, autoDismiss: false, sticky: true },
        trigger: null, 
      });
    } catch (error) {}
  };

  const finishDrink = async (drinkId: string) => {
    await Notifications.dismissAllNotificationsAsync();
    setConsumedDrinks((prevDrinks) => {
      const updatedList = prevDrinks.map(drink => drink.id === drinkId ? { ...drink, endTime: Date.now() } : drink);
      AsyncStorage.setItem('drinkHistory', JSON.stringify(updatedList)).catch(()=>{});
      return updatedList;
    });
  };

  const finishAndRepeatDrink = async (drinkId: string) => {
    await Notifications.dismissAllNotificationsAsync();
    try {
      const storedData = await AsyncStorage.getItem('drinkHistory');
      if (!storedData) return;
      let history: Drink[] = JSON.parse(storedData);

      const drinkToRepeat = history.find((d) => d.id === drinkId);
      if (!drinkToRepeat) return;

      history = history.map((d) => d.id === drinkId ? { ...d, endTime: Date.now() } : d);

      const newDrinkId = Date.now().toString();
      const newDrink = { id: newDrinkId, name: drinkToRepeat.name, volume: drinkToRepeat.volume, abv: drinkToRepeat.abv, startTime: Date.now(), endTime: null, stomachContent: drinkToRepeat.stomachContent };
      
      history.push(newDrink);
      await AsyncStorage.setItem('drinkHistory', JSON.stringify(history));
      setConsumedDrinks(history);

      await Notifications.scheduleNotificationAsync({
        content: { title: "🍺 Active Drink", body: `Drinking: ${newDrink.name}.`, categoryIdentifier: 'ACTIVE_DRINK', data: { drinkId: newDrinkId }, autoDismiss: false, sticky: true },
        trigger: null,
      });
    } catch (error) {}
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
    
    const stomachVal = item.stomachContent !== undefined ? item.stomachContent : (item.consumedWithFood ? 1 : 0);
    let foodStatusText = '⏳ Empty Stomach';
    if (stomachVal === 0.25) foodStatusText = '🥪 Light Snack';
    if (stomachVal === 0.5) foodStatusText = '🌮 Moderate Meal';
    if (stomachVal === 1) foodStatusText = '🍔 Full Meal';

    return (
      <TouchableOpacity onLongPress={() => deleteDrink(item.id)} delayLongPress={500}>
        <View style={[styles.drinkCard, item.endTime === null && styles.activeDrinkCard]}>
          <Text style={styles.drinkName}>{item.name}</Text>
          <Text style={styles.drinkDetails}>{item.volume}ml • {item.abv}% ABV • {stdDrinks} Std Drinks</Text>
          <Text style={styles.timeDetails}>Started: {startString} {item.endTime ? `• Finished: ${endString}` : ''}</Text>
          <Text style={styles.foodDetails}>{foodStatusText}</Text>
          
          {item.endTime === null && (
            <View style={styles.finishButtonContainer}>
              <Button title="Finish Drink" color="#ff9800" onPress={() => finishDrink(item.id)} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const sortedDrinks = [...consumedDrinks].sort((a, b) => b.startTime - a.startTime).slice(0, 10);
  const activeDrinkCount = consumedDrinks.filter(drink => drink.endTime === null).length;

  const applyPreset = (presetName: string, presetVolume: string, presetAbv: string) => {
    setDrinkName(presetName); setDrinkVolume(presetVolume); setDrinkAbv(presetAbv);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Drink Dashboard</Text>
      
      {userWeight === 0 && (
        <View style={styles.missingProfileBanner}>
          <Text style={styles.missingProfileText}>⚠️ Go to Profile and set Weight for accurate BAC</Text>
        </View>
      )}

      <TouchableOpacity activeOpacity={0.8} onPress={() => setIsDetailsModalVisible(true)}>
        <View style={[styles.bacContainer, { borderColor: bacColor, borderWidth: 2 }]}>
          <Text style={styles.bacLabel}>Estimated BAC</Text>
          <Text style={[styles.bacNumber, { color: bacColor }]}>{currentBAC}%</Text>
          
          <View style={styles.bacDetailsRow}>
            <Text style={styles.bacDetailText}>Limit: {drivingLimit.toFixed(2)}%</Text>
            <Text style={styles.bacDetailTextDivider}>|</Text>
            <Text style={styles.bacDetailText}>Peak: {projectedPeak}%</Text>
          </View>
          <View style={styles.bacDetailsRow}>
            <Text style={styles.bacDetailText}>Sober in: {timeToSober}</Text>
          </View>

          {bacChartData.datasets[0].data.length > 1 && (
            <LineChart
              data={bacChartData}
              width={screenWidth - 80} 
              height={180} // Increased height to prevent time clipping
              withDots={true}
              withInnerLines={false}
              withOuterLines={false}
              bezier 
              chartConfig={{
                backgroundColor: '#343a40',
                backgroundGradientFrom: '#343a40',
                backgroundGradientTo: '#343a40',
                decimalPlaces: 3,
                color: (opacity = 1) => bacColor, 
                labelColor: (opacity = 1) => '#adb5bd',
                propsForDots: { r: "4", strokeWidth: "2", stroke: bacColor }
              }}
              style={{ marginVertical: 15, borderRadius: 10 }}
            />
          )}
          <Text style={{color: '#6c757d', fontSize: 10, fontStyle: 'italic', marginTop: 5}}>Tap card for details & bigger chart</Text>
        </View>
      </TouchableOpacity>

      <Button title="+ Add Drink" onPress={() => setIsModalVisible(true)} color="#007BFF" />
      <Text style={styles.subtitle}>Recent Drinks:</Text>
      
      {activeDrinkCount > 0 && (
        <View style={styles.activeWarningBanner}>
          <Text style={styles.activeWarningText}>⚠️ You have {activeDrinkCount} unfinished drink{activeDrinkCount > 1 ? 's' : ''}</Text>
        </View>
      )}
      <Text style={styles.hintText}>(Press and hold a drink to delete it)</Text>

      <FlatList data={sortedDrinks} keyExtractor={(item) => item.id} renderItem={renderDrinkItem} style={styles.list} />

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
            <View style={styles.inputRow}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Volume (ml):</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={drinkVolume} onChangeText={setDrinkVolume} placeholder="e.g. 330" />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>ABV (%):</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={drinkAbv} onChangeText={setDrinkAbv} placeholder="e.g. 5.0" />
              </View>
            </View>
            <Text style={styles.label}>Stomach Content:</Text>
            <View style={styles.presetGrid}>
              {[0, 0.25, 0.5, 1].map((val, idx) => {
                const labels = ["Empty (0%)", "Snack (25%)", "Moderate (50%)", "Full (100%)"];
                return (
                  <TouchableOpacity key={idx} style={[styles.foodButton, stomachContent === val && styles.foodButtonActive]} onPress={() => setStomachContent(val)}>
                    <Text style={[styles.foodButtonText, stomachContent === val && styles.foodButtonTextActive]}>{labels[idx]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.modalButtonRow}>
              <Button title="Cancel" color="#dc3545" onPress={() => setIsModalVisible(false)} />
              <Button title="Log Drink" color="#28a745" onPress={logCustomDrink} />
            </View>
          </View>
        </View>
      </Modal>

      {/* --- REPAIRED: ACTIVE DRINK IMPACT MODAL --- */}
      <Modal visible={isDetailsModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Bloodstream Analysis</Text>

            {/* NEW: Massive, clean chart rendered specifically for the modal */}
            {bacChartData.datasets[0].data.length > 1 && (
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <LineChart
                  data={bacChartData}
                  width={screenWidth * 0.75} // Perfectly scaled to fit inside the modal
                  height={220}
                  withDots={true}
                  bezier
                  chartConfig={{
                    backgroundColor: '#ffffff',
                    backgroundGradientFrom: '#ffffff',
                    backgroundGradientTo: '#ffffff',
                    decimalPlaces: 3,
                    color: (opacity = 1) => bacColor,
                    labelColor: (opacity = 1) => '#333',
                    propsForDots: { r: "4", strokeWidth: "2", stroke: bacColor }
                  }}
                  style={{ borderRadius: 10, alignSelf: 'center' }}
                />
                <Text style={{ fontSize: 12, color: '#888', marginTop: 5 }}>
                  Grey line indicates the {drivingLimit.toFixed(2)}% limit
                </Text>
              </View>
            )}

            <Text style={{marginBottom: 10, color: '#666', textAlign: 'center', fontWeight: 'bold'}}>
              Drinks from the last 24 hours currently affecting your BAC:
            </Text>
            
            <ScrollView style={{maxHeight: 200, width: '100%'}}>
              {consumedDrinks.filter(d => (d.endTime ? d.endTime : Date.now()) > Date.now() - (24 * 60 * 60 * 1000)).map((drink) => {
                 const totalGrams = drink.volume * (drink.abv / 100) * 0.789;
                 const weightToUse = userWeight > 0 ? userWeight : 75;
                 const r = userGender.toUpperCase().startsWith('F') ? 0.55 : 0.68;
                 const maxBacImpact = (totalGrams / (weightToUse * r * 10)).toFixed(3);
                 return (
                   <View key={drink.id} style={{padding: 10, borderBottomWidth: 1, borderColor: '#eee'}}>
                     <Text style={{fontWeight: 'bold', fontSize: 16}}>{drink.name}</Text>
                     <Text style={{color: '#555'}}>Time: {new Date(drink.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
                     <Text style={{color: '#d63384', fontWeight: 'bold'}}>Total Potential BAC Impact: +{maxBacImpact}%</Text>
                   </View>
                 );
              })}
              {consumedDrinks.filter(d => (d.endTime ? d.endTime : Date.now()) > Date.now() - (24 * 60 * 60 * 1000)).length === 0 && (
                <Text style={{textAlign: 'center', color: '#888', marginTop: 20}}>No recent drinks in your bloodstream.</Text>
              )}
            </ScrollView>

            <View style={{marginTop: 20}}>
              {/* FIXED: The trap door is open. (false) */}
              <Button title="Close" color="#007BFF" onPress={() => setIsDetailsModalVisible(false)} /> 
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
  missingProfileBanner: { backgroundColor: '#f8d7da', padding: 10, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#f5c6cb' },
  missingProfileText: { color: '#721c24', fontWeight: 'bold', textAlign: 'center', fontSize: 13 },
  bacContainer: { backgroundColor: '#343a40', padding: 20, borderRadius: 15, alignItems: 'center', marginBottom: 20, marginTop: 10 },
  bacLabel: { color: '#adb5bd', fontSize: 16, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  bacNumber: { fontSize: 48, fontWeight: 'bold', marginTop: 5 },
  bacDetailsRow: { flexDirection: 'row', marginTop: 10, alignItems: 'center' },
  bacDetailText: { color: '#ced4da', fontSize: 14, fontWeight: '500' },
  bacDetailTextDivider: { color: '#6c757d', fontSize: 14, marginHorizontal: 10 },
  subtitle: { fontSize: 18, fontWeight: 'bold', marginTop: 10, marginBottom: 5 },
  hintText: { fontSize: 12, color: '#888', marginBottom: 10, fontStyle: 'italic' },
  activeWarningBanner: { backgroundColor: '#fff3cd', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, marginBottom: 5, borderWidth: 1, borderColor: '#ffe69c' },
  activeWarningText: { color: '#856404', fontWeight: 'bold', fontSize: 14, textAlign: 'center' },
  list: { flex: 1 },
  drinkCard: { backgroundColor: '#ffffff', padding: 15, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#e0e0e0' },
  activeDrinkCard: { borderColor: '#ff9800', borderWidth: 2, backgroundColor: '#fff9e6' },
  drinkName: { fontSize: 18, fontWeight: 'bold' },
  drinkDetails: { fontSize: 14, color: '#666666', marginTop: 5 },
  timeDetails: { fontSize: 14, color: '#17a2b8', marginTop: 5, fontWeight: '500' },
  foodDetails: { fontSize: 13, color: '#856404', marginTop: 5, fontWeight: '600', backgroundColor: '#fff3cd', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, alignSelf: 'flex-start' },
  finishButtonContainer: { marginTop: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 15, width: '90%' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  label: { fontSize: 16, marginBottom: 5, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: '#cccccc', padding: 10, marginBottom: 15, borderRadius: 8, fontSize: 16 },
  inputRow: { flexDirection: 'row', justifyContent: 'space-between' },
  halfInput: { width: '48%' },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 15 },
  presetButton: { backgroundColor: '#e9ecef', width: '48%', paddingVertical: 12, borderRadius: 8, marginBottom: 10, alignItems: 'center' },
  presetText: { color: '#495057', fontWeight: 'bold' },
  foodButton: { backgroundColor: '#e9ecef', width: '48%', paddingVertical: 12, borderRadius: 8, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: '#cccccc' },
  foodButtonActive: { backgroundColor: '#007BFF', borderColor: '#007BFF' },
  foodButtonText: { color: '#495057', fontWeight: 'bold', fontSize: 13 },
  foodButtonTextActive: { color: '#ffffff' },
  modalButtonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
});