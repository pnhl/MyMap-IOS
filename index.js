import { registerRootComponent } from 'expo';
import {registerGlobals} from '@livekit/react-native';
registerGlobals();
import './src/services/backgroundLocationTask';
import './src/services/sharedSync';
import App from './App';
registerRootComponent(App);
