import { NextResponse } from "next/server";
import {
  executeIndustryResearchRun,
  parseRunRequest,
  RequestValidationError,
} from "../_lib/run-core";
import {
  authorizeIndustryResearchRequest,
  loadServerEnv,
} from "../_lib/server-env";

export async function POST(request: Request) {
  const env = loadServerEnv();

  const auth = authorizeIndustryResearchRequest(request, env);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { input, mode } = parseRunRequest(await request.json());
    const { result, deliveryPackage } = await executeIndustryResearchRun({
      input,
      mode,
      env,
    });

    return NextResponse.json({ result, deliveryPackage });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof RequestValidationError ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
