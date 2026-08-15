# Security Policy

First and foremost, thank you for taking the time to report a vulnerability. We take the security of ORBIT and the Ohnrshyp ecosystem seriously and appreciate the community's help in keeping it safe.

## Supported Versions

Please check if the version you are testing is currently supported with security updates. We only accept vulnerability reports for supported versions.

| Version | Supported          |
| ------- | ------------------ |
| >= 1.1.1| ✅ Yes             |
| < 1.1.1 | ❌ No              |

## Reporting a Vulnerability

**🚨 Please do not report security vulnerabilities through public GitHub issues.**

If you believe you have found a security vulnerability in ORBIT, please report it to us confidentially using GitHub's Private Vulnerability Reporting. 

**How to report:**
1. Navigate to the **[Security tab](https://github.com/focusjordan/ORBIT/security/advisories/new)** of this repository.
2. Click the **Report a vulnerability** button.
3. Provide a clear description of the vulnerability, the potential impact, and detailed steps to reproduce it.
4. Please include a proof-of-concept (PoC) directly within the secure advisory.

**What to expect:**
* We will acknowledge receipt of your report within **48 hours**.
* We will triage the report and collaborate with you in the private advisory space to verify the issue and develop a patch.
* Once the vulnerability is resolved, we will publish the advisory and officially credit you as the discoverer through GitHub's security system.

## Out of Scope

To respect both your time and ours, the following types of reports are considered out of scope and will not be actionable:
* Vulnerabilities in third-party dependencies (please report those to the respective upstream projects, unless our specific implementation is flawed).
* Denial of Service (DoS) attacks requiring massive amounts of traffic.
* Issues requiring physical access to a user's device or internal network.
* Missing security headers or best practices that do not lead to a direct, exploitable vulnerability.

## Disclosure Policy

We follow responsible disclosure. We ask that you give us a reasonable amount of time to patch the issue in our private fork before discussing it publicly or sharing the exploit details. In return, we commit to fixing severe issues promptly and keeping you informed throughout the patching process.
