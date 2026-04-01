import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BarChart } from 'react-native-chart-kit';

type Drink = {
  id: string;
  name: string;
  volume: number;
  abv: number;
  startTime: number;
};

const screenWidth = Dimensions.get('window').width;

export default function StatsScreen() {
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [region, setRegion] = useState('NZ/AU');
  const [startHour, setStartHour] = useState(5); // NEW: State for the offset
  const [timeframe, setTimeframe] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Yearly'>('Daily');
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setTimeout(() => {
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollToEnd({ animated: false });
      }
    }, 100);
  }, [timeframe, drinks]);

  const loadData = async () => {
    try {
      const savedDrinks = await AsyncStorage.getItem('drinkHistory');
      const savedRegion = await AsyncStorage.getItem('userRegion');
      const savedStart = await AsyncStorage.getItem('startOfDay'); // NEW: Fetch custom time
      
      if (savedDrinks) setDrinks(JSON.parse(savedDrinks));
      if (savedRegion) setRegion(savedRegion);
      if (savedStart) setStartHour(parseInt(savedStart, 10)); // Ensure it is a number
    } catch (error) {
      Alert.alert('Error', 'Failed to load data for charts.');
    }
  };

  const calculateStandardDrinks = (volume: number, abv: number, reg: string) => {
    const grams = volume * (abv / 100) * 0.789;
    let divider = 10;
    if (reg === 'UK') divider = 8;
    if (reg === 'USA') divider = 14;
    return grams / divider;
  };

  const getChartData = () => {
    let labels: string[] = [];
    let values: number[] = [];
    
    // THE DYNAMIC SHIFT: Uses the user's custom profile setting!
    const START_OF_DAY_OFFSET = startHour * 60 * 60 * 1000; 
    const adjustedNow = new Date(Date.now() - START_OF_DAY_OFFSET);

    if (drinks.length === 0) {
      return { labels: ['Today'], datasets: [{ data: [0] }] };
    }

    const validDrinks = drinks.filter(d => d.startTime > 1262304000000); 
    const oldestDrinkTime = validDrinks.length > 0 ? Math.min(...validDrinks.map(d => d.startTime - START_OF_DAY_OFFSET)) : adjustedNow.getTime();
    const oldestDate = new Date(oldestDrinkTime);

    if (timeframe === 'Daily') {
      const daysToGenerate = 30; 
      for (let i = daysToGenerate - 1; i >= 0; i--) {
        const d = new Date(adjustedNow.getFullYear(), adjustedNow.getMonth(), adjustedNow.getDate() - i);
        labels.push(`${d.getDate()}/${d.getMonth() + 1}`); 
        values.push(0);
      }
      validDrinks.forEach(drink => {
        const d = new Date(drink.startTime - START_OF_DAY_OFFSET); 
        const diffTime = new Date(adjustedNow.getFullYear(), adjustedNow.getMonth(), adjustedNow.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays < daysToGenerate) {
          values[daysToGenerate - 1 - diffDays] += calculateStandardDrinks(drink.volume, drink.abv, region);
        }
      });

    } else if (timeframe === 'Weekly') {
      const weeksToGenerate = 26;
      for (let i = weeksToGenerate - 1; i >= 0; i--) {
        labels.push(i === 0 ? 'This Wk' : `-${i}W`);
        values.push(0);
      }
      
      const startOfThisWeek = new Date(adjustedNow.getFullYear(), adjustedNow.getMonth(), adjustedNow.getDate());
      const dayOfWeek = startOfThisWeek.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; 
      startOfThisWeek.setDate(startOfThisWeek.getDate() + diffToMonday);
      startOfThisWeek.setHours(0, 0, 0, 0);

      validDrinks.forEach(drink => {
        const d = new Date(drink.startTime - START_OF_DAY_OFFSET); 
        const diffTime = startOfThisWeek.getTime() - d.getTime();
        let diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
        
        if (d.getTime() >= startOfThisWeek.getTime()) diffWeeks = 0;

        if (diffWeeks >= 0 && diffWeeks < weeksToGenerate) {
          values[weeksToGenerate - 1 - diffWeeks] += calculateStandardDrinks(drink.volume, drink.abv, region);
        }
      });

    } else if (timeframe === 'Monthly') {
      let totalMonths = (adjustedNow.getFullYear() - oldestDate.getFullYear()) * 12 + (adjustedNow.getMonth() - oldestDate.getMonth()) + 1;
      
      if (totalMonths > 36) totalMonths = 36; 
      if (totalMonths < 6) totalMonths = 6; 

      for (let i = totalMonths - 1; i >= 0; i--) {
        const d = new Date(adjustedNow.getFullYear(), adjustedNow.getMonth() - i, 1);
        labels.push(`${d.toLocaleDateString(undefined, { month: 'short' })}\n'${d.getFullYear().toString().slice(-2)}`);
        values.push(0);
      }
      validDrinks.forEach(drink => {
        const d = new Date(drink.startTime - START_OF_DAY_OFFSET); 
        const monthDiff = (adjustedNow.getFullYear() - d.getFullYear()) * 12 + (adjustedNow.getMonth() - d.getMonth());
        if (monthDiff >= 0 && monthDiff < totalMonths) {
          values[totalMonths - 1 - monthDiff] += calculateStandardDrinks(drink.volume, drink.abv, region);
        }
      });

    } else if (timeframe === 'Yearly') {
      let totalYears = adjustedNow.getFullYear() - oldestDate.getFullYear() + 1;
      
      if (totalYears > 15) totalYears = 15; 
      if (totalYears < 5) totalYears = 5; 

      const currentYear = adjustedNow.getFullYear();
      for (let i = totalYears - 1; i >= 0; i--) {
        labels.push((currentYear - i).toString());
        values.push(0);
      }
      validDrinks.forEach(drink => {
        const d = new Date(drink.startTime - START_OF_DAY_OFFSET); 
        const yearDiff = currentYear - d.getFullYear();
        if (yearDiff >= 0 && yearDiff < totalYears) {
          values[totalYears - 1 - yearDiff] += calculateStandardDrinks(drink.volume, drink.abv, region);
        }
      });
    }

    return {
      labels,
      datasets: [{ data: values.length ? values.map(v => parseFloat(v.toFixed(1))) : [0] }]
    };
  };

  const chartData = getChartData();
  const chartWidth = Math.max(screenWidth - 60, chartData.labels.length * 45);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Drink Statistics</Text>

      <View style={styles.toggleContainer}>
        {['Daily', 'Weekly', 'Monthly', 'Yearly'].map((tf) => (
          <TouchableOpacity 
            key={tf} 
            style={[styles.toggleButton, timeframe === tf && styles.toggleButtonActive]}
            onPress={() => setTimeframe(tf as any)}
          >
            <Text style={[styles.toggleText, timeframe === tf && styles.toggleTextActive]}>{tf}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Standard Drinks ({timeframe})</Text>
        <Text style={styles.scrollHint}>← Swipe to view history</Text>
        
        <ScrollView 
          horizontal={true} 
          showsHorizontalScrollIndicator={false}
          ref={scrollViewRef}
          style={styles.scrollWindow}
        >
          <BarChart
            data={chartData}
            width={chartWidth} 
            height={320}
            yAxisLabel=""
            yAxisSuffix=""
            fromZero={true}
            showValuesOnTopOfBars={true} 
            withHorizontalLabels={false} 
            chartConfig={{
              backgroundColor: '#ffffff',
              backgroundGradientFrom: '#ffffff',
              backgroundGradientTo: '#ffffff',
              decimalPlaces: 1,
              color: (opacity = 1) => `rgba(0, 123, 255, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(100, 100, 100, ${opacity})`,
              style: { borderRadius: 16 },
              barPercentage: 0.6,
              propsForLabels: { fontSize: 10 }
            }}
            style={styles.chartStyle}
          />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8f9fa', paddingTop: 50 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#333' },
  toggleContainer: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#e9ecef', borderRadius: 10, padding: 5, marginBottom: 20 },
  toggleButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  toggleButtonActive: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  toggleText: { color: '#6c757d', fontWeight: 'bold', fontSize: 13 },
  toggleTextActive: { color: '#007BFF' },
  chartCard: { backgroundColor: '#ffffff', padding: 15, borderRadius: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 3 },
  chartTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  scrollHint: { fontSize: 12, color: '#888', fontStyle: 'italic', marginBottom: 15 },
  scrollWindow: { width: '100%' },
  chartStyle: { marginVertical: 8, borderRadius: 16 },
});