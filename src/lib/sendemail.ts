import nodemailer from "nodemailer";

export const sendResetEmail = async (to: string, token: string) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: "Reset your password",
    html: `<p>Click below to reset your password:</p>
           <a href="${resetLink}">${resetLink}</a>`,
  });
};
