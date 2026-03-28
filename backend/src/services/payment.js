import crypto from "crypto";
import Stripe from "stripe";
import "../env.js";

const PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER || "mock";

let stripeClient = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20"
  });
}

const getProvider = () => {
  if (PAYMENT_PROVIDER === "stripe" && stripeClient) {
    return "stripe";
  }
  return "mock";
};

const toMinorAmount = (amount) => {
  const numeric = Number(amount || 0);
  return Math.max(0, Math.round(numeric * 100));
};

export const createGatewayIntent = async ({
  amount,
  currency = "usd",
  metadata = {}
}) => {
  const provider = getProvider();

  if (provider === "stripe") {
    const intent = await stripeClient.paymentIntents.create({
      amount: toMinorAmount(amount),
      currency,
      metadata,
      automatic_payment_methods: {
        enabled: true
      }
    });

    return {
      provider,
      gatewayReference: intent.id,
      clientSecret: intent.client_secret,
      amount,
      currency,
      status: intent.status
    };
  }

  const mockRef = `mock_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  return {
    provider: "mock",
    gatewayReference: mockRef,
    clientSecret: `mock_client_${mockRef}`,
    amount,
    currency,
    status: "requires_confirmation"
  };
};

export const verifyGatewayPayment = async ({ gatewayReference }) => {
  if (!gatewayReference) {
    return {
      ok: false,
      provider: getProvider(),
      status: "missing_reference"
    };
  }

  const provider = getProvider();

  if (provider === "stripe") {
    const intent = await stripeClient.paymentIntents.retrieve(gatewayReference);
    const success = intent.status === "succeeded";
    return {
      ok: success,
      provider,
      status: intent.status,
      amount: Number(intent.amount || 0) / 100,
      metadata: intent.metadata || {}
    };
  }

  const success = String(gatewayReference).startsWith("mock_");
  return {
    ok: success,
    provider: "mock",
    status: success ? "succeeded" : "failed",
    metadata: {}
  };
};

export const getPaymentProvider = () => getProvider();
