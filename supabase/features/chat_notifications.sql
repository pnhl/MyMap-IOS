begin;
create function private.mm_chat_notify() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.mm_rooms; recipient uuid;
begin
 select * into r from public.mm_rooms where id=new.room_id;
 foreach recipient in array r.members loop
  if recipient<>new.sender_id then
   insert into public.vc_notifications(user_id,type,title,body,payload)
   values(recipient,'chat',coalesce(nullif(r.name,''),'Tin nhắn riêng'),
    case new.kind when 'text' then left(new.body,120) when 'voice' then 'Lời nhắn âm thanh' when 'photo' then 'Ảnh mới' else 'Video mới' end,
    jsonb_build_object('roomId',new.room_id,'messageId',new.id));
  end if;
 end loop;
 return new;
end $$;
create trigger mm_chat_notify after insert on public.mm_messages for each row execute function private.mm_chat_notify();
create function public.mm_read_notification(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=private.mm_user();begin
 update public.vc_notifications set read_at=coalesce(read_at,now()) where id=p_id and user_id=me;
end $$;
revoke all on function public.mm_read_notification(uuid) from public;
grant execute on function public.mm_read_notification(uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
