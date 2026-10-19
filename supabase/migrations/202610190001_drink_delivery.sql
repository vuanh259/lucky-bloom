begin;
create or replace function public.lb_api(action text,payload jsonb default '{}'::jsonb,token_hash text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 ses lucky_bloom.sessions%rowtype; player lucky_bloom.players%rowtype; item jsonb; gift lucky_bloom.gifts%rowtype;
 sid bigint; selected bigint; previous bigint; turns integer; amount integer; phone text; addr text; bank text; acct text; holder text;
 method text; details jsonb; qr text; role_name text; result jsonb; n integer; k text;
begin
 if action='gifts' then return (select jsonb_agg(jsonb_build_object('id',id,'name',name,'emoji',emoji,'color',color,'tier',tier,'cashValue',case when g.tier='special' then null else g.amount end) order by id) from lucky_bloom.gifts g where g.active); end if;
 if action='prizes' then return (select jsonb_agg(jsonb_build_object('id',id,'label',label,'quantity',quantity) order by position) from lucky_bloom.prizes); end if;
 if action='rate' then
   k:=payload->>'key'; if k is null or length(k)>100 then return jsonb_build_object('error','Yêu cầu không hợp lệ.','status',400); end if;
   delete from lucky_bloom.rate_limits where expires_at<now();
   insert into lucky_bloom.rate_limits values(k,1,now()+interval '1 minute') on conflict(key) do update set n=lucky_bloom.rate_limits.n+1 returning rate_limits.n into n;
   if n>25 then return jsonb_build_object('error','Bạn thao tác hơi nhanh. Thử lại sau một phút nhé.','status',429); end if;
   return jsonb_build_object('ok',true);
 end if;
 select * into ses from lucky_bloom.sessions s where s.token_hash=lb_api.token_hash and expires_at>now();
 if action='admin-session' then
   insert into lucky_bloom.sessions values(payload->>'new_hash',null,'admin',now()+interval '7 days'); return jsonb_build_object('ok',true);
 end if;
 if action='join' then
   if coalesce(length(payload->>'name'),0) not between 1 and 80 or coalesce(payload->>'gender','') not in ('female','male') or coalesce(length(payload->>'name_key'),0)=0 then return jsonb_build_object('error','Hãy nhập tên và chọn giới tính hợp lệ.','status',400); end if;
   perform pg_advisory_xact_lock(hashtextextended((payload->>'name_key')||':'||(payload->>'gender'),0));
   select * into player from lucky_bloom.players where name_key=payload->>'name_key' and gender=payload->>'gender';
   if player.id is null then
     insert into lucky_bloom.players(name,name_key,gender) values(payload->>'name',payload->>'name_key',payload->>'gender') returning * into player; role_name:='user';
   elsif ses.role='user' and ses.player_id=player.id then role_name:='user';
   else role_name:='review'; end if;
   insert into lucky_bloom.sessions values(payload->>'new_hash',player.id,role_name,now()+interval '365 days');
   return lucky_bloom.state(player.id,role_name='review');
 end if;
 if ses.role is null then return jsonb_build_object('error','Hãy nhập tên và giới tính để vào chơi nhé.','status',401); end if;
 if action like 'admin-%' then
   if ses.role<>'admin' then return jsonb_build_object('error','Bạn cần quyền quản trị.','status',401); end if;
   if action='admin-logout' then delete from lucky_bloom.sessions s where s.token_hash=lb_api.token_hash; return jsonb_build_object('ok',true); end if;
   if action='admin-players' then return coalesce((select jsonb_agg(lucky_bloom.state(p.id,false) order by p.id desc) from lucky_bloom.players p),'[]'::jsonb); end if;
   if action='admin-values' then
     if payload ? 'items' then
       if jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')<>(select count(*) from lucky_bloom.gifts where active) then return jsonb_build_object('error','Cấu hình quà không hợp lệ.','status',400); end if;
       if (select count(distinct v->>'id') from jsonb_array_elements(payload->'items') v)<>(select count(*) from lucky_bloom.gifts where active) then return jsonb_build_object('error','Mã quà không hợp lệ.','status',400); end if;
       for item in select * from jsonb_array_elements(payload->'items') loop
         if item->>'id'='surprise' and item->>'amount' is not null then return jsonb_build_object('error','Giải đặc biệt không được quy đổi.','status',400); end if;
         if not exists(select 1 from lucky_bloom.gifts where active and id=item->>'id') or (item->>'amount' is not null and (item->>'amount'!~'^\d+$' or (item->>'amount')::numeric not between 1000 and 1000000000)) then return jsonb_build_object('error','Giá trị quy đổi không hợp lệ.','status',400); end if;
       end loop;
       for item in select * from jsonb_array_elements(payload->'items') loop update lucky_bloom.gifts set amount=(item->>'amount')::integer where active and id=item->>'id'; end loop;
     end if;
     return public.lb_api('gifts','{}',null);
   end if;
   if action='admin-prizes' then
     if payload ? 'items' then
       if jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')<>(select count(*) from lucky_bloom.prizes) or (select count(distinct v->>'id') from jsonb_array_elements(payload->'items') v)<>(select count(*) from lucky_bloom.prizes) then return jsonb_build_object('error','Cơ cấu giải không hợp lệ.','status',400); end if;
       for item in select * from jsonb_array_elements(payload->'items') loop
         if not exists(select 1 from lucky_bloom.prizes where id=item->>'id') or coalesce(item->>'quantity','')!~'^\d+$' or (item->>'quantity')::numeric not between 0 and 100000 then return jsonb_build_object('error','Số lượng giải không hợp lệ.','status',400); end if;
       end loop;
       for item in select * from jsonb_array_elements(payload->'items') loop update lucky_bloom.prizes set quantity=(item->>'quantity')::integer where id=item->>'id'; end loop;
     end if;
     return public.lb_api('prizes','{}',null);
   end if;
 end if;
 if action='qr' then
   if ses.role='admin' then sid:=coalesce((payload->>'userId')::bigint,0);
   elsif ses.role='user' then sid:=ses.player_id; if payload ? 'userId' and (payload->>'userId')::bigint<>sid then return jsonb_build_object('error','Bạn không được xem ảnh này.','status',403); end if;
   else return jsonb_build_object('error','Phiên xem lại không được xem QR.','status',403); end if;
   select qr_path into qr from lucky_bloom.receiving where user_id=sid;
   if qr is null then return jsonb_build_object('error','Chưa có ảnh QR.','status',404); end if;
   return jsonb_build_object('path',qr);
 end if;
 if ses.role='admin' then return jsonb_build_object('error','Không tìm thấy thao tác.','status',404); end if;
 if action='me' then return lucky_bloom.state(ses.player_id,ses.role='review'); end if;
 select * into player from lucky_bloom.players where id=ses.player_id;
 if action='leave' and player.gender='male' then delete from lucky_bloom.sessions s where s.token_hash=lb_api.token_hash; return jsonb_build_object('ok',true); end if;
 if ses.role<>'user' then return jsonb_build_object('error','Phiên này chỉ được xem lại kết quả.','status',403); end if;
 if player.gender<>'female' then return jsonb_build_object('error','bai anh em','status',403); end if;
 perform pg_advisory_xact_lock(player.id);
 if action='spin' then
   select count(*) into turns from lucky_bloom.spins where user_id=player.id;
   if turns>=3 then return jsonb_build_object('error','Bạn đã dùng hết 3 lượt quay rồi.','status',409); end if;
   select * into gift from lucky_bloom.gifts where active order by id offset ((payload->>'random_index')::integer % (select count(*) from lucky_bloom.gifts where active)) limit 1;
   insert into lucky_bloom.spins(user_id,turn,gift) values(player.id,turns+1,jsonb_build_object('id',gift.id,'name',gift.name,'emoji',gift.emoji,'color',gift.color,'tier',gift.tier));
 elsif action='choose' then
   if (select count(*) from lucky_bloom.spins where user_id=player.id)<>3 then return jsonb_build_object('error','Hãy quay đủ 3 lượt trước khi chọn quà nhé.','status',409); end if;
   select id into selected from lucky_bloom.spins where id=(payload->>'spinId')::bigint and user_id=player.id;
   if selected is null then return jsonb_build_object('error','Hãy chọn từ 3 kết quả của bạn.','status',400); end if;
   select spin_id into previous from lucky_bloom.choices where user_id=player.id;
   if previous is distinct from selected and exists(select 1 from lucky_bloom.receiving where user_id=player.id) then return jsonb_build_object('error','Bạn đã gửi thông tin nhận quà nên không thể đổi quà nữa.','status',409); end if;
   if previous is distinct from selected then insert into lucky_bloom.choices values(player.id,selected,now()) on conflict(user_id) do update set spin_id=excluded.spin_id,created_at=excluded.created_at; end if;
 elsif action='receive' then
   select c.spin_id,g.id,g.name,g.emoji,g.color,g.tier,g.amount into selected,gift.id,gift.name,gift.emoji,gift.color,gift.tier,gift.amount from lucky_bloom.choices c join lucky_bloom.spins s on s.id=c.spin_id join lucky_bloom.gifts g on g.id=s.gift->>'id' where c.user_id=player.id;
   if selected is null then return jsonb_build_object('error','Hãy chốt quà trước khi điền cách nhận.','status',400); end if;
   if coalesce((payload->>'expectedSpinId')::bigint,0)<>selected then return jsonb_build_object('error','Món quà đã thay đổi. Hãy tải lại trang.','status',409); end if;
   if exists(select 1 from lucky_bloom.receiving where user_id=player.id) then return jsonb_build_object('error','Thông tin nhận đã được gửi.','status',409); end if;
   if payload->>'mode'='gift' then
     phone:=regexp_replace(coalesce(payload->>'phone',''),'[\s().-]','','g'); addr:=btrim(coalesce(payload->>'address',''));
     if phone!~'^(0[0-9]{9}|\+84[0-9]{9})$' or length(addr) not between 10 and 500 then return jsonb_build_object('error','Hãy điền SĐT và địa chỉ giao hàng hợp lệ.','status',400); end if;
     details:=jsonb_build_object('phone',phone,'address',addr); amount:=null;
     if gift.id in ('tea','lemon-tea') then
       if coalesce(payload->>'deliveryDate','')!~'^\d{4}-\d{2}-\d{2}$' then return jsonb_build_object('error','Chọn ngày nhận hợp lệ.','status',400); end if;
       begin
         if to_char((payload->>'deliveryDate')::date,'YYYY-MM-DD')<>payload->>'deliveryDate' or (payload->>'deliveryDate')::date<(now() at time zone 'Asia/Bangkok')::date then return jsonb_build_object('error','Chọn ngày nhận hợp lệ, từ hôm nay trở đi.','status',400); end if;
       exception when invalid_datetime_format or datetime_field_overflow then return jsonb_build_object('error','Chọn ngày nhận hợp lệ.','status',400); end;
       if coalesce(payload->>'deliveryFrom','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(payload->>'deliveryTo','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or payload->>'deliveryFrom'>=payload->>'deliveryTo' then return jsonb_build_object('error','Chọn khoảng giờ hợp lệ, giờ kết thúc sau giờ bắt đầu.','status',400); end if;
       details:=details||jsonb_build_object('deliveryDate',payload->>'deliveryDate','deliveryFrom',payload->>'deliveryFrom','deliveryTo',payload->>'deliveryTo');
       if gift.id='tea' then
         if coalesce(length(btrim(payload->>'drinkFlavor')),0) not between 1 and 120 then return jsonb_build_object('error','Nhập vị trà sữa muốn uống (tối đa 120 ký tự).','status',400); end if;
         details:=details||jsonb_build_object('drinkFlavor',btrim(payload->>'drinkFlavor'));
       end if;
     end if;
   elsif payload->>'mode'='cash' then
     if gift.tier='special' then return jsonb_build_object('error','Giải đặc biệt không được quy đổi.','status',400); end if;
     amount:=gift.amount;
     if amount is null then return jsonb_build_object('error','Quà này chưa có giá trị quy đổi.','status',400); end if;
     if (payload->>'expectedAmount')::integer is distinct from amount then return jsonb_build_object('error','Giá trị quy đổi đã thay đổi. Hãy tải lại trang.','status',409); end if;
     method:=payload->>'method';
     if method='bank' then
       bank:=btrim(payload->>'bank'); acct:=btrim(payload->>'account'); holder:=btrim(payload->>'holder');
       if coalesce(length(bank),0) not between 2 and 100 or coalesce(acct,'')!~'^[A-Za-z0-9-]{4,40}$' or coalesce(length(holder),0) not between 2 and 100 then return jsonb_build_object('error','Hãy nhập thông tin ngân hàng hợp lệ.','status',400); end if;
       details:=jsonb_build_object('method','bank','bank',bank,'account',acct,'holder',holder);
     elsif method='qr' and coalesce(payload->>'qr_path','') like player.id::text||'/%' then qr:=payload->>'qr_path'; details:=jsonb_build_object('method','qr');
     else return jsonb_build_object('error','Hãy nhập tài khoản hoặc tải QR hợp lệ.','status',400); end if;
   else return jsonb_build_object('error','Hãy chọn cách nhận.','status',400); end if;
   insert into lucky_bloom.receiving(user_id,mode,details,amount,qr_path) values(player.id,payload->>'mode',details,amount,qr);
 else return jsonb_build_object('error','Không tìm thấy thao tác.','status',404);
 end if;
 return lucky_bloom.state(player.id,false);
end;
$$;
revoke all on function public.lb_api(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.lb_api(text,jsonb,text) to service_role;

commit;
