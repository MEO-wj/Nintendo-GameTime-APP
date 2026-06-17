import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { theme } from "../theme";
import { HomeScreen } from "../screens/home/HomeScreen";
import { LibraryScreen } from "../screens/library/LibraryScreen";
import { GameDetailScreen } from "../screens/library/GameDetailScreen";
import { DiscoverScreen } from "../screens/discover/DiscoverScreen";
import { CatalogDetailScreen } from "../screens/discover/CatalogDetailScreen";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import { IconGamepad, IconClock, IconPrice, IconTrophy } from "../icons";

const Tab = createBottomTabNavigator();
const LibraryStack = createNativeStackNavigator();
const DiscoverStack = createNativeStackNavigator();

function LibraryStackScreen() {
  return (
    <LibraryStack.Navigator screenOptions={{ headerShown: false }}>
      <LibraryStack.Screen name="LibraryList" component={LibraryScreen} />
      <LibraryStack.Screen name="GameDetail" component={GameDetailScreen} />
    </LibraryStack.Navigator>
  );
}

function DiscoverStackScreen() {
  return (
    <DiscoverStack.Navigator screenOptions={{ headerShown: false }}>
      <DiscoverStack.Screen name="DiscoverList" component={DiscoverScreen} />
      <DiscoverStack.Screen name="CatalogDetail" component={CatalogDetailScreen} />
    </DiscoverStack.Navigator>
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 0.5,
          paddingTop: 4,
          height: 56,
        },
        tabBarLabelStyle: {
          fontSize: theme.fontSize.xs,
          fontWeight: theme.fontWeight.medium,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: "概览",
          tabBarIcon: ({ color }) => <IconGamepad size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="Library"
        component={LibraryStackScreen}
        options={{
          tabBarLabel: "游戏库",
          tabBarIcon: ({ color }) => <IconClock size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="Discover"
        component={DiscoverStackScreen}
        options={{
          tabBarLabel: "发现",
          tabBarIcon: ({ color }) => <IconPrice size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: "我的",
          tabBarIcon: ({ color }) => <IconTrophy size={22} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
