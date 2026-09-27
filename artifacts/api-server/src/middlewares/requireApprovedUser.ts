import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

function emailList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(/[,;\n]/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdministrator(email: string): boolean {
  return emailList(process.env.HUB_ADMIN_EMAILS).has(email);
}

export const requireApprovedUser: RequestHandler = async (req, res, next): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Entre para consultar a relação." });
    return;
  }

  // Designating an administrator also approves that person for read access.
  const allowed = new Set([
    ...emailList(process.env.HUB_ALLOWED_EMAILS),
    ...emailList(process.env.HUB_ADMIN_EMAILS),
  ]);
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

    res.locals.approvedEmail = email.emailAddress.trim().toLowerCase();
    next();
  } catch (error) {
    req.log.error({ err: error }, "Failed to verify approved user");
    res.status(503).json({ error: "Não foi possível verificar seu acesso agora." });
  }
};

// Mount after requireApprovedUser so role decisions use the verified primary email.
export const requireAdministrator: RequestHandler = (_req, res, next): void => {
  const email = res.locals.approvedEmail;
  if (typeof email !== "string" || !isAdministrator(email)) {
    res.status(403).json({ error: "Somente administradores designados podem alterar a relação." });
    return;
  }
  next();
};