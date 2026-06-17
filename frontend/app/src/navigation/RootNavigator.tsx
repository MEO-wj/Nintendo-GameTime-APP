import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../theme";
import { AuthScreen } from "../screens/auth/AuthScreen";
import { MainTabs } from "./MainTabs";
import { LoadingOverlay } from "../components/LoadingOverlay";

const Stack = createNativeStackNavigator();

const DarkNavTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: theme.colors.accent,
    background: theme.colors.bg,
    card: theme.colors.surface,
    text: theme.colors.ink,
    border: theme.colors.border,
    notification: theme.colors.joyRed,
  },
};

export function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingOverlay />;

  return (
    <NavigationContainer theme={DarkNavTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Auth" component={AuthScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
