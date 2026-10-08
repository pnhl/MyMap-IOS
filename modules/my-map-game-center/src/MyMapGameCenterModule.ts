import { NativeModule, requireOptionalNativeModule } from 'expo';

export type GameCenterSignInResult = {
  uid: string;
  displayName?: string | null;
  playerId?: string | null;
};

declare class MyMapGameCenterNativeModule extends NativeModule {
  isAvailable(): Promise<boolean>;
  signIn(): Promise<GameCenterSignInResult>;
}

export default requireOptionalNativeModule<MyMapGameCenterNativeModule>('MyMapGameCenter');
