package com.wassel.backend.auth.entity;

/** What an authentication email was for. The names are the CHECK in V18's {@code auth_emails}. */
public enum AuthEmailKind {
	LOGIN_CODE, RESEND_CODE, RESET_LINK, INVITE_LINK
}
