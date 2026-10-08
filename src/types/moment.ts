export type MomentKind='photo'|'video';
export type MomentStatus='local'|'queued'|'published'|'failed';
export type Moment={
 id:string; account:string; kind:MomentKind; uri:string; coverUri:string; capturedAt:number;
 durationSeconds:number; caption:string; latitude:number|null; longitude:number|null;
 status:MomentStatus; recipients:string[]; groupId:string|null; shareLocation:boolean;
 error?:string|null; ownerId?:string; authorName?:string; remote?:boolean; isMine?:boolean; mediaPath?:string; coverPath?:string; unclaimed?:boolean;
};
export type MomentGroup={id:string;name:string;owner_id:string;members:string[]};
export type MomentReply={id:string;moment_id:string;owner_id:string;kind:'text'|'emoji'|'voice';body:string;created_at:string};
