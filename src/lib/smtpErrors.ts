export interface SmtpHelp {
  title: string
  fix: string
  link?: { href: string; label: string }
}

/** Turns a raw SMTP or network error into what went wrong and how to fix it. */
export function explainSmtpError(raw: string, host = ''): SmtpHelp {
  const msg = raw.toLowerCase()
  const gmail = /gmail|googlemail/.test(host.toLowerCase()) || msg.includes('gsmtp') || msg.includes('support.google.com/mail')

  if (/\b53[45]\b|invalid login|authentication (failed|unsuccessful)|credentials|username and password/.test(msg)) {
    return gmail
      ? {
          title: 'Gmail rejected the username or password',
          fix: 'Gmail only accepts an App Password here, not your normal password. Turn on 2-Step Verification, create an App Password and paste its 16 letters. The username is your full Gmail address.',
          link: { href: 'https://myaccount.google.com/apppasswords', label: 'Create an App Password' },
        }
      : {
          title: 'The server rejected the username or password',
          fix: 'Check both fields. Many providers want an app password or API key here instead of your account password.',
        }
  }
  if (/wrong version number|ssl routines|handshake|unexpected eof|certificate|self.signed/.test(msg)) {
    return { title: "The security setting doesn't match the port", fix: 'Use SSL/TLS with port 465, or STARTTLS with port 2525.' }
  }
  if (/enotfound|getaddrinfo|name or service not known|name resolution/.test(msg)) {
    return { title: `The server ${host || ''} was not found`.replace('  ', ' '), fix: 'Check the SMTP host for typos, for example smtp.gmail.com.' }
  }
  if (/etimedout|timed out|timeout|econnrefused|connection refused|ehostunreach|unreachable|econnreset/.test(msg)) {
    return {
      title: `Couldn't connect to ${host || 'the server'}`,
      fix: 'Check the host and port. Supabase blocks ports 25 and 587, so use 465 (SSL/TLS) or 2525 (STARTTLS).',
    }
  }
  if (/\b55[0-4]\b|sender|not owned|not allowed to send|relay|from address/.test(msg)) {
    return {
      title: 'The server refused the sender address',
      fix: gmail
        ? 'Send from your Gmail address, or first add the sender as a "Send mail as" address in Gmail settings.'
        : "Send from an address on a domain you verified with your provider, or from the account's own address.",
    }
  }
  if (/\b4[25]\d\b|rate limit|too many|quota|try again later/.test(msg)) {
    return { title: 'The server is limiting sending right now', fix: "Wait a few minutes and try again, or check your provider's sending limits." }
  }
  return { title: 'The email could not be sent', fix: 'Check the SMTP settings, then send a test email.' }
}
