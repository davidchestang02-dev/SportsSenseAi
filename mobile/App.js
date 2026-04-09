import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { palette } from "./app/theme/palette";
import SlateScreen from "./app/screens/SlateScreen";
import MarketScreen from "./app/screens/MarketScreen";
import RiskScreen from "./app/screens/RiskScreen";
import AutoBetScreen from "./app/screens/AutoBetScreen";
import AdminScreen from "./app/screens/AdminScreen";

const Tab = createBottomTabNavigator();

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: palette.background,
    card: palette.surface,
    text: palette.text,
    border: palette.border,
    primary: palette.accent
  }
};

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={theme}>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: "#081824",
              borderTopColor: "#173246"
            },
            tabBarActiveTintColor: palette.accent,
            tabBarInactiveTintColor: palette.muted
          }}
        >
          <Tab.Screen name="Slate" component={SlateScreen} />
          <Tab.Screen name="Markets" component={MarketScreen} />
          <Tab.Screen name="Risk" component={RiskScreen} />
          <Tab.Screen name="AutoBet" component={AutoBetScreen} />
          <Tab.Screen name="Admin" component={AdminScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
