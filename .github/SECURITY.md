# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue,
please report it responsibly.

### How to Report

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please report security vulnerabilities through one of these channels:

1. **GitHub Security Advisories** (Preferred):
   - Go to the
     [Security Advisories](https://github.com/slopstudios/slopstudios3/security/advisories/new)
     page
   - Click "Report a vulnerability"
   - Fill in the details

2. **Email**:
   - Send an email to security@slopstudios.com
   - Include "SECURITY" in the subject line
   - Encrypt sensitive information using our PGP key (available on request)

### What to Include

Please include the following information in your report:

- Type of vulnerability (e.g., SQL injection, XSS, authentication bypass)
- Full path to the vulnerable file(s)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact assessment
- Any suggested fixes

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 5 business days
- **Resolution Target**: Within 30 days for critical issues

### What to Expect

1. We will acknowledge receipt of your report
2. We will investigate and validate the issue
3. We will work on a fix and coordinate disclosure
4. We will credit you in our security acknowledgments (unless you prefer to
   remain anonymous)

### Safe Harbor

We consider security research conducted in accordance with this policy to be:

- Authorized concerning any applicable anti-hacking laws
- Authorized concerning any relevant anti-circumvention laws
- Exempt from restrictions in our Terms of Service that would interfere with
  conducting security research

We will not pursue civil or criminal action against researchers who:

- Engage in testing within the scope of this policy
- Do not access, modify, or delete data belonging to others
- Do not degrade the performance of our services
- Report vulnerabilities promptly after discovery
- Do not publicly disclose vulnerabilities before we've had a chance to address
  them

## Security Best Practices

### For Contributors

- Never commit secrets or credentials
- Use environment variables for sensitive configuration
- Follow the principle of least privilege
- Validate all user inputs
- Use parameterized queries to prevent SQL injection
- Implement proper authentication and authorization
- Keep dependencies up to date

### For Users

- Use strong, unique passwords
- Enable two-factor authentication where available
- Keep your local environment secure
- Report suspicious activity immediately

## Security Measures

This project implements the following security measures:

- Automated dependency vulnerability scanning (Dependabot)
- Static Application Security Testing (SAST) via CodeQL
- Input validation and sanitization
- Parameterized database queries
- Secure headers (HSTS, CSP, etc.)
- Rate limiting
- Audit logging

## Acknowledgments

We thank the following individuals for responsibly disclosing security issues:

<!-- Add acknowledgments here as vulnerabilities are reported and fixed -->

---

Thank you for helping keep Slop Studios 3 and our users safe!
