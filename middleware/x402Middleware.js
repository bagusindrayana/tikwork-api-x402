const { preparePaymentHeader, verify, settle } = require("x402/facilitator");

const PAYTO_ADDRESS = process.env.X402_PAYTO_ADDRESS || "0xYourAddressHere";

const paymentRoutes = {
  "/api/jobs": {
    price: "$0.0001",
    network: "base-sepolia",
    config: {
      description: "Access to for-you jobs page > 1",
    },
  },
  "/api/jobs/for-you": {
    price: "$0.0001",
    network: "base-sepolia",
    config: {
      description: "Access to for-you jobs page > 1",
    },
  },
  "/api/jobs/explore": {
    price: "$0.0001",
    network: "base-sepolia",
    config: {
      description: "Access to explore jobs page > 1",
    },
  },
  "/api/jobs/latest-input": {
    price: "$0.0001",
    network: "base-sepolia",
    config: {
      description: "Access to latest input jobs",
    },
  },
  "/api/jobs/:id/poster": {
    price: "$0.0005",
    network: "base-sepolia",
    config: {
      description: "Access to job poster",
    },
  },
};

function isPaidRoute(pathname) {
  for (const route of Object.keys(paymentRoutes)) {
    if (route.includes(":")) {
      const routePattern = route.replace(/:[^/]+/g, "[^/]+");
      const regex = new RegExp(`^${routePattern}$`);
      if (regex.test(pathname)) {
        return route;
      }
    } else if (pathname === route || pathname.startsWith(route + "/")) {
      return route;
    }
  }
  return null;
}

function shouldCharge(pathname, query) {
  if (pathname === "/api/jobs/latest-input") {
    return true;
  }

  if (
    pathname === "/api/jobs/for-you" ||
    pathname === "/api/jobs/explore" ||
    pathname === "/api/jobs"
  ) {
    const page = parseInt(query.page) || 1;
    return page > 1;
  }

  if (pathname.match(/^\/api\/jobs\/[^/]+\/poster$/)) {
    return true;
  }

  return false;
}

async function x402Middleware(req, res, next) {
  const pathname = req.path;
  const matchedRoute = isPaidRoute(pathname);

  if (!matchedRoute) {
    return next();
  }

  if (!shouldCharge(pathname, req.query)) {
    return next();
  }

  const paymentHeader = req.headers["x-payment"];

  if (!paymentHeader) {
    const routeConfig = paymentRoutes[matchedRoute];
    return res.status(402).json({
      x402Version: 1,
      accepts: [
        {
          scheme: "usdc",
          network: routeConfig.network,
          currency: "USDC",
          amount: routeConfig.price,
          description: routeConfig.config?.description || "Payment required",
        },
      ],
    });
  }

  try {
    const payment = await preparePaymentHeader(paymentHeader, PAYTO_ADDRESS);
    const verification = await verify(payment, PAYTO_ADDRESS);

    if (!verification.valid) {
      return res.status(402).json({
        error: "Invalid payment",
        details: verification.error,
      });
    }

    await settle(payment);
    req.paymentVerified = true;
    next();
  } catch (error) {
    console.error("Payment verification error:", error);
    return res.status(402).json({
      error: "Payment verification failed",
      details: error.message,
    });
  }
}

module.exports = { x402Middleware, paymentRoutes };
