const{test}=require('node:test'),assert=require('node:assert/strict');
const{loadPure}=require('./helpers.cjs'),{accountError}=loadPure('src/utils/accountErrors.ts');
test('permission and conflict errors explain the action in Vietnamese',()=>{assert.match(accountError({message:'owner_only'}).message,/chủ nhóm/);assert.match(accountError({message:'profile_not_public'}).message,/công khai/);assert.match(accountError({message:'report_already_processed'}).message,/đã được xử lý/);});
test('unexpected database details do not escape into the interface',()=>{assert.doesNotMatch(accountError({message:'constraint mm_private_key failed for secret@email.test'}).message,/mm_private|secret|constraint/);});
test('network failures retain a useful retry instruction',()=>{assert.match(accountError(Error('Failed to fetch')).message,/Kiểm tra mạng/);});
