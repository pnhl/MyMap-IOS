import CallScreen from '../screens/CallScreen';
import SharedContentScreen from '../screens/SharedContentScreen';
import DeviceAiScreen from '../screens/DeviceAiScreen';
import EnvironmentScreen from '../screens/EnvironmentScreen';
import SocialToolsScreen from '../screens/SocialToolsScreen';
import ModerationScreen from '../screens/ModerationScreen';
import DrivingInsightsScreen from '../screens/DrivingInsightsScreen';
import SearchScreen from '../screens/SearchScreen';
import OfflineMapsScreen from '../screens/OfflineMapsScreen';
import OfflineRoutesScreen from '../screens/OfflineRoutesScreen';
import MediaToolsScreen from '../screens/MediaToolsScreen';
import ChatScreen from '../screens/ChatScreen';
import {AppDock} from '../ui/AppDock';
import React from 'react';
import LegalScreen from '../screens/LegalScreen';
import CatalogScreen from '../screens/CatalogScreen';
import ReachableRangeScreen from '../screens/ReachableRangeScreen';
import RouteComparisonScreen from '../screens/RouteComparisonScreen';
import MusicScreen from '../screens/MusicScreen';
import MomentsScreen from '../screens/MomentsScreen';
import MomentCameraScreen from '../screens/MomentCameraScreen';
import MomentDetailScreen from '../screens/MomentDetailScreen';
import MemoryDetailScreen from '../screens/MemoryDetailScreen';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import MapScreen from '../screens/MapScreen';import TimelineScreen from '../screens/TimelineScreen';import MemoriesScreen from '../screens/MemoriesScreen';import FriendsScreen from '../screens/FriendsScreen';import ProfileScreen from '../screens/ProfileScreen';import SmartScreen from '../screens/SmartScreen';import SOSScreen from '../screens/SOSScreen';import HeatmapScreen from '../screens/HeatmapScreen';import SettingsScreen from '../screens/SettingsScreen';import PlaceDetailScreen from '../screens/PlaceDetailScreen';import LoginScreen from '../screens/LoginScreen';
import type{MainTabsParamList,RootStackParamList} from './types';
import {useAppTheme} from '../ui/theme';

const Tabs=createBottomTabNavigator<MainTabsParamList>();const Stack=createNativeStackNavigator<RootStackParamList>();

function MainTabs(){const{theme}=useAppTheme();return <Tabs.Navigator tabBar={props=><AppDock tabs={props}/>} screenOptions={{headerShown:false,sceneStyle:{backgroundColor:theme.colors.bg},tabBarHideOnKeyboard:true}}><Tabs.Screen name="Map" component={MapScreen} options={{title:'Bản đồ'}}/><Tabs.Screen name="Timeline" component={TimelineScreen}/><Tabs.Screen name="Memories" component={MemoriesScreen} options={{title:'Kỷ niệm'}}/><Tabs.Screen name="Friends" component={FriendsScreen} options={{title:'Bạn bè'}}/><Tabs.Screen name="Profile" component={ProfileScreen} options={{title:'Cá nhân'}}/></Tabs.Navigator>}
export default function AppNavigator(){const{theme}=useAppTheme();return <Stack.Navigator screenOptions={{headerShown:false,contentStyle:{backgroundColor:theme.colors.bg},animation:'fade'}}><Stack.Screen name="Tabs" component={MainTabs}/><Stack.Screen name="Smart" component={SmartScreen}/><Stack.Screen name="SOS" component={SOSScreen}/><Stack.Screen name="Heatmap" component={HeatmapScreen}/><Stack.Screen name="Settings" component={SettingsScreen}/><Stack.Screen name="RouteComparison" component={RouteComparisonScreen}/><Stack.Screen name="ReachableRange" component={ReachableRangeScreen}/><Stack.Screen name="Catalog" component={CatalogScreen}/><Stack.Screen name="Search" component={SearchScreen}/><Stack.Screen name="OfflineMaps" component={OfflineMapsScreen}/><Stack.Screen name="OfflineRoutes" component={OfflineRoutesScreen}/><Stack.Screen name="MediaTools" component={MediaToolsScreen}/><Stack.Screen name="Environment" component={EnvironmentScreen}/><Stack.Screen name="DeviceAi" component={DeviceAiScreen}/><Stack.Screen name="Call" component={CallScreen}/><Stack.Screen name="SocialTools" component={SocialToolsScreen}/><Stack.Screen name="Moderation" component={ModerationScreen}/><Stack.Screen name="SharedContent" component={SharedContentScreen}/><Stack.Screen name="DrivingInsights" component={DrivingInsightsScreen}/><Stack.Screen name="Chat" component={ChatScreen}/><Stack.Screen name="PlaceDetail" component={PlaceDetailScreen}/><Stack.Screen name="MemoryDetail" component={MemoryDetailScreen}/><Stack.Screen name="Legal" component={LegalScreen}/><Stack.Screen name="Music" component={MusicScreen}/><Stack.Screen name="Moments" component={MomentsScreen}/><Stack.Screen name="MomentCamera" component={MomentCameraScreen}/><Stack.Screen name="MomentDetail" component={MomentDetailScreen}/><Stack.Screen name="Login" component={LoginScreen}/></Stack.Navigator>}
