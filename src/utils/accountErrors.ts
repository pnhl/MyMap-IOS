const MESSAGES:Record<string,string>={
 owner_only:'Chỉ chủ nhóm có thể thực hiện thao tác này.',
 profile_not_public:'Người này chưa bật hồ sơ công khai để theo dõi.',
 moderator_only:'Tài khoản này không có quyền kiểm duyệt.',
 blocked_conversation:'Hội thoại không còn khả dụng do quan hệ chặn.',
 content_unavailable:'Nội dung đã bị gỡ hoặc bạn không còn quyền truy cập.',
 report_already_processed:'Báo cáo này đã được xử lý. Hãy tải lại danh sách.',
 report_missing:'Báo cáo này không còn khả dụng.',
 event_finished:'Cuộc hẹn đã kết thúc, không thể đăng ký tham gia.',
 invitation_expired:'Lời mời đã hết hạn hoặc bị hủy.',
 group_unavailable:'Nhóm đã đầy hoặc bạn không còn quyền tham gia.',
 room_unavailable:'Bạn không còn quyền truy cập nhóm này.',
 invalid_avatar:'Ảnh đại diện chưa được tải lên đúng tài khoản. Hãy chọn lại ảnh.',
 invalid_profile:'Tên hoặc giới thiệu chưa hợp lệ.',
 rate_limit:'Bạn thao tác quá nhanh. Chờ một lát rồi thử lại.',
 rate_limited:'Bạn thao tác quá nhanh. Chờ một lát rồi thử lại.',
 authentication_required:'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
 not_authenticated:'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
};
export function accountError(error:unknown):Error{
 const value=typeof error==='object'&&error&&'message'in error?String(error.message):String(error);
 if(MESSAGES[value])return Error(MESSAGES[value]);
 if(/network|fetch|offline|timed? ?out/i.test(value))return Error('Không thể kết nối máy chủ. Kiểm tra mạng rồi thử lại.');
 return Error('Không thể thực hiện thao tác này. Hãy tải lại và thử lần nữa.');
}
