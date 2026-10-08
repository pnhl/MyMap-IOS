const{loadService}=require('./service-loader.cjs');
exports.loadPinnedService=(relative,mocks)=>loadService(relative,{...mocks,'./accountApi':{accountApi:async()=>{const user=await mocks['./auth'].getCurrentUser();return{owner:user.id,client:mocks['./supabase'].supabase,assertCurrent:async()=>{if(user.id!==(await mocks['./auth'].getCurrentUser())?.id)throw Error('Tài khoản đã thay đổi.');}};}}});
