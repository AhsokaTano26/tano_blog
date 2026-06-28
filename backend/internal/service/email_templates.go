package service

import (
	"fmt"
	"strings"
)

func renderNewCommentEmail(siteTitle, nickname, content, postTitle, postSlug, siteURL string) string {
	postLink := siteURL + "/posts/" + postSlug
	escapedContent := htmlEscape(content)

	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
  <div style="background:linear-gradient(135deg,#667eea 0%%,#764ba2 100%%);padding:24px 32px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">%s</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">新评论通知</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      <strong>%s</strong> 在文章「%s」中发表了评论：
    </p>
    <div style="background:#f9fafb;border-left:3px solid #667eea;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:20px;">
      <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7;white-space:pre-wrap;">%s</p>
    </div>
    <a href="%s" style="display:inline-block;padding:10px 24px;background:#667eea;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500;">查看文章</a>
  </div>
  <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">此邮件由 %s 自动发送</p>
  </div>
</div>
</body>
</html>`, siteTitle, htmlEscape(nickname), htmlEscape(postTitle), escapedContent, postLink, siteTitle)
}

func renderCommentApprovedEmail(siteTitle, nickname, postTitle, postSlug, siteURL string) string {
	postLink := siteURL + "/posts/" + postSlug

	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
  <div style="background:linear-gradient(135deg,#10b981 0%%,#059669 100%%);padding:24px 32px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">%s</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">评论审核通知</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      %s，您好！
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      您在文章「%s」中发表的评论已通过审核。
    </p>
    <a href="%s" style="display:inline-block;padding:10px 24px;background:#10b981;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500;">查看评论</a>
  </div>
  <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">此邮件由 %s 自动发送</p>
  </div>
</div>
</body>
</html>`, siteTitle, htmlEscape(nickname), htmlEscape(postTitle), postLink, siteTitle)
}

func renderTestEmail(siteTitle string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
  <div style="background:linear-gradient(135deg,#667eea 0%%,#764ba2 100%%);padding:24px 32px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">%s</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">邮件配置测试</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      恭喜！您的邮件通知配置已成功。
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
      收到此邮件表示 SMTP/API 配置正确，邮件发送功能可以正常使用。
    </p>
  </div>
  <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">此邮件由 %s 自动发送</p>
  </div>
</div>
</body>
</html>`, siteTitle, siteTitle)
}

func renderReplyEmail(siteTitle, parentNickname, replyNickname, replyContent, postTitle, postSlug, siteURL string) string {
	postLink := siteURL + "/posts/" + postSlug
	escapedContent := htmlEscape(replyContent)

	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
  <div style="background:linear-gradient(135deg,#f59e0b 0%%,#d97706 100%%);padding:24px 32px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">%s</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">评论回复通知</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      %s，您好！
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      <strong>%s</strong> 回复了您在文章「%s」中的评论：
    </p>
    <div style="background:#f9fafb;border-left:3px solid #f59e0b;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:20px;">
      <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7;white-space:pre-wrap;">%s</p>
    </div>
    <a href="%s" style="display:inline-block;padding:10px 24px;background:#f59e0b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500;">查看回复</a>
  </div>
  <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">此邮件由 %s 自动发送</p>
  </div>
</div>
</body>
</html>`, siteTitle, htmlEscape(parentNickname), htmlEscape(replyNickname), htmlEscape(postTitle), escapedContent, postLink, siteTitle)
}

func renderPasswordResetEmail(siteTitle, resetLink string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
  <div style="background:linear-gradient(135deg,#ef4444 0%%,#dc2626 100%%);padding:24px 32px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">%s</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">密码重置</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">您好！</p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      我们收到了您的密码重置请求。请点击下方链接重置密码，<strong>该链接1小时内有效</strong>：
    </p>
    <a href="%s" style="display:inline-block;padding:10px 24px;background:#ef4444;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500;word-break:break-all;">重置密码</a>
    <p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
      如果您没有请求重置密码，请忽略此邮件。
    </p>
  </div>
  <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">此邮件由 %s 自动发送</p>
  </div>
</div>
</body>
</html>`, siteTitle, resetLink, siteTitle)
}

func renderLoginAlertEmail(siteTitle, username, ip, loginTime string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
  <div style="background:linear-gradient(135deg,#6366f1 0%%,#4f46e5 100%%);padding:24px 32px;">
    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">%s</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">新登录提醒</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
      您的账户 <strong>%s</strong> 有新登录活动：
    </p>
    <table style="width:100%%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:10px 16px;background:#f9fafb;border:1px solid #e5e7eb;color:#6b7280;font-size:13px;">IP 地址</td>
        <td style="padding:10px 16px;background:#f9fafb;border:1px solid #e5e7eb;color:#374151;font-size:13px;font-family:monospace;">%s</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;background:#ffffff;border:1px solid #e5e7eb;color:#6b7280;font-size:13px;">时间</td>
        <td style="padding:10px 16px;background:#ffffff;border:1px solid #e5e7eb;color:#374151;font-size:13px;">%s</td>
      </tr>
    </table>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
      如果不是您本人操作，请立即修改密码。
    </p>
  </div>
  <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">此邮件由 %s 自动发送</p>
  </div>
</div>
</body>
</html>`, siteTitle, htmlEscape(username), ip, loginTime, siteTitle)
}

func htmlEscape(s string) string {
	r := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		"\"", "&quot;",
		"'", "&#39;",
	)
	return r.Replace(s)
}
