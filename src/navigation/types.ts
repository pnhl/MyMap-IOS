export type RootStackParamList={
  Tabs:undefined;
  Smart:undefined;
  SOS:undefined;
  Heatmap:undefined;
  Settings:undefined;
  Catalog:{tab?:'trip'|'vehicle'|'collection'|'journal'|'event'|'review'|'road_report'|'privacy';documentId?:string}|undefined;
  Search:{query?:string}|undefined;
  DeviceAi:{task?:'assistant'|'caption'|'journal'|'search';draft?:string}|undefined;
  Environment:undefined;
  MediaTools:undefined;
  OfflineMaps:undefined;
  OfflineRoutes:undefined;
  ReachableRange:undefined;
  RouteComparison:undefined;
  Call:{callId:string};
  SocialTools:undefined;
  Moderation:undefined;
  SharedContent:{documentId:string};
  DrivingInsights:undefined;
  Chat:{roomId?:string}|undefined;
  Legal:{document:'terms'|'privacy'|'about'};
  Music:undefined;
  Moments:{groupId?:string}|undefined;
  MomentCamera:{purpose?:'memory'|'moment'}|undefined;
  MomentDetail:{momentId:string};
  MemoryDetail:{photoId:number};
  PlaceDetail:{placeId?:string;name?:string;latitude?:number;longitude?:number;osmType?:'node'|'way'|'relation';osmId?:number}|undefined;
  Login:{redirectTo?:string}|undefined;
};

export type MainTabsParamList={
  Map:{destination?:{latitude:number;longitude:number;name:string};travelMode?:'motorbike'|'car'|'foot'|'bike';focusFriendId?:string;searchQuery?:string}|undefined;
  Timeline:undefined;
  Memories:{focusSearch?:boolean}|undefined;
  Friends:undefined;
  Profile:undefined;
};
