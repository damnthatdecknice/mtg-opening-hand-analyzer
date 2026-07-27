import { NextResponse } from "next/server";

type BugReportBody = {
  email?: string;
  description?: string;
  page?: string;
  userAgent?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.BUG_REPORT_TO_EMAIL;
  const fromEmail = process.env.BUG_REPORT_FROM_EMAIL ?? "Opening Edge <onboarding@resend.dev>";

  if (!apiKey || !toEmail) {
    return NextResponse.json(
      { error: "Bug report delivery is not configured yet." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as BugReportBody;
  const reporterEmail = clean(body.email, 254).toLowerCase();
  const description = clean(body.description, 5000);
  const page = clean(body.page, 500);
  const userAgent = clean(body.userAgent, 500);

  if (!emailPattern.test(reporterEmail)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (description.length < 12) {
    return NextResponse.json({ error: "Describe the bug in a little more detail." }, { status: 400 });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      reply_to: reporterEmail,
      subject: "Opening Edge bug report",
      text: [
        "Opening Edge bug report",
        "",
        `Reporter: ${reporterEmail}`,
        page ? `Page: ${page}` : "",
        userAgent ? `User agent: ${userAgent}` : "",
        "",
        description
      ].filter(Boolean).join("\n")
    })
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Bug report email could not be sent. Please try again later." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
