import nodemailer from "nodemailer";

export const sendOtpEmail = async (to: string, otp: string) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: "Verify your account",
    html: `
      <p>Welcome to our platform!</p>
      <p>Please use the OTP below to verify your account:</p>
      <h2>${otp}</h2>
      <p>This code will expire in 10 minutes.</p>
    `,
  });
};
