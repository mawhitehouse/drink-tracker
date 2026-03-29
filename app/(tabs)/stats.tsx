import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
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
  const [timeframe, setTimeframe] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Yearly'>('Daily');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const savedDrinks = await AsyncStorage.getItem('drinkHistory');
      const savedRegion = await AsyncStorage.getItem('userRegion');
      if (savedDrinks) setDrinks(JSON.parse(savedDrinks));
      if (savedRegion) setRegion(savedRegion);
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
    const now = new Date();

    if (timeframe === 'Daily') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
        values.push(0);
      }
      drinks.forEach(drink => {
        const d = new Date(drink.startTime);
        const diffTime = Math.abs(now.getTime() - d.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays <= 7) {
          const labelIndex = labels.indexOf(d.toLocaleDateString(undefined, { weekday: 'short' }));
          if (labelIndex !== -1) {
            values[labelIndex] += calculateStandardDrinks(drink.volume, drink.abv, region);
          }
        }
      });

    } else if (timeframe === 'Weekly') {
      labels = ['3W Ago', '2W Ago', 'Last Wk', 'This Wk'];
      values = [0, 0, 0, 0];
      drinks.forEach(drink => {
        const diffTime = now.getTime() - drink.startTime;
        const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
        if (diffWeeks < 4) {
          values[3 - diffWeeks] += calculateStandardDrinks(drink.volume, drink.abv, region);
        }
      });

    } else if (timeframe === 'Monthly') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(d.toLocaleDateString(undefined, { month: 'short' }));
        values.push(0);
      }
      drinks.forEach(drink => {
        const d = new Date(drink.startTime);
        const monthDiff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
        if (monthDiff < 6 && monthDiff >= 0) {
          values[5 - monthDiff] += calculateStandardDrinks(drink.volume, drink.abv, region);
        }
      });

    } else if (timeframe === 'Yearly') {
      const currentYear = now.getFullYear();
      for (let i = 4; i >= 0; i--) {
        labels.push((currentYear - i).toString());
        values.push(0);
      }
      drinks.forEach(drink => {
        const d = new Date(drink.startTime);
        const yearDiff = currentYear - d.getFullYear();
        if (yearDiff < 5 && yearDiff >= 0) {
          values[4 - yearDiff] += calculateStandardDrinks(drink.volume, drink.abv, region);
        }
      });
    }

    return {
      labels,
      datasets: [{ data: values.length ? values.map(v => parseFloat(v.toFixed(1))) : [0] }]
    };
  };

  const chartData = getChartData();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
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
        <BarChart
          data={chartData}
          width={screenWidth - 60} 
          height={300}
          yAxisLabel=""
          yAxisSuffix=""
          fromZero={true}
          chartConfig={{
            backgroundColor: '#ffffff',
            backgroundGradientFrom: '#ffffff',
            backgroundGradientTo: '#ffffff',
            decimalPlaces: 1,
            color: (opacity = 1) => `rgba(0, 123, 255, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(100, 100, 100, ${opacity})`,
            style: { borderRadius: 16 },
            barPercentage: 0.6,
          }}
          style={styles.chartStyle}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8f9fa', paddingTop: 50 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#333' },
  toggleContainer: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#e9ecef', borderRadius: 10, padding: 5, marginBottom: 30 },
  toggleButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  toggleButtonActive: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  toggleText: { color: '#6c757d', fontWeight: 'bold', fontSize: 13 },
  toggleTextActive: { color: '#007BFF' },
  chartCard: { backgroundColor: '#ffffff', padding: 15, borderRadius: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 3, alignItems: 'center' },
  chartTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 15, alignSelf: 'flex-start' },
  chartStyle: { marginVertical: 8, borderRadius: 16 },
});