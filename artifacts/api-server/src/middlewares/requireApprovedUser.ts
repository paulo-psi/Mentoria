import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

function approvedEmails(): Set<string> {
  return new Set(
    (process.env.HUB_ALLOWED_EMAILS ?? "")
      .split(/[,;\n]/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const requireApprovedUser: RequestHandler = async (req, res, next): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Entre para consultar a relação." });
    return;
  }

  const allowed = approvedEmails();
  if (allowed.size === 0) {
    res.status(403).json({ error: "Nenhum e-mail foi aprovado para acessar o Hub." });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const email = user.primaryEmailAddress;
    if (
      email?.verification?.status !== "verified" ||
      !allowed.has(email.emailAddress.trim().toLowerCase())
    ) {
      res.status(403).json({ error: "Seu e-mail ainda não foi aprovado para acessar o Hub." });
      return;
    }

    next();
  } catch (error) {
    req.log.error({ err: error }, "Failed to verify approved user");
    res.status(503).json({ error: "Não foi possível verificar seu acesso agora." });
  }
};