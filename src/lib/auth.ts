import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { jwt } from "better-auth/plugins";
import { getDB } from "../config/db.js";

const createAuth = () =>
  betterAuth({
    database: mongodbAdapter(getDB()),
    emailAndPassword: {
      enabled: true,
    },
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: [process.env.CLIENT_URL].filter(
      (origin): origin is string => Boolean(origin)
    ),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "customer",
          input: false,
        },
        isBlocked: {
          type: "boolean",
          defaultValue: false,
          input: false,
        },
        businessName: {
          type: "string",
          required: false,
          input: true,
        },
        subscriptionPlan: {
          type: "string",
          defaultValue: "free",
          input: false,
        },
        subscriptionExpiresAt: {
          type: "date",
          required: false,
          input: false,
        },
        requestedRole: {
          type: "string",
          required: false,
          input: true,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const { requestedRole, ...data } = user;

            return {
              data: {
                ...data,
                role: requestedRole === "vendor" ? "vendor" : "customer",
                isBlocked: false,
                subscriptionPlan: "free",
                requestedRole: undefined,
              },
            };
          },
        },
      },
    },
    plugins: [jwt()],
  });

type AuthInstance = ReturnType<typeof createAuth>;

let auth: AuthInstance | null = null;

export function getAuth(): AuthInstance {
  if (auth) return auth;

  auth = createAuth();

  return auth;
}
