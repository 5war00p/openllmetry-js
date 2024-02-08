import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  SimpleSpanProcessor,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { Span, context } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { Instrumentation } from "@opentelemetry/instrumentation";
import { InitializeOptions } from "../interfaces";
import { SpanAttributes } from "@traceloop/ai-semantic-conventions";
import { ASSOCATION_PROPERTIES_KEY, WORKFLOW_NAME_KEY } from "./tracing";
import { Telemetry } from "../telemetry/telemetry";
import { TraceloopSampler } from "./sampler";
import { _configuration } from "../configuration";
import { OpenAIInstrumentation } from "@traceloop/instrumentation-openai";
import { AzureOpenAIInstrumentation } from "@traceloop/instrumentation-azure";
import { LangChainInstrumentation } from "@traceloop/instrumentation-langchain";
import { LlamaIndexInstrumentation } from "@traceloop/instrumentation-llamaindex";
import { PineconeInstrumentation } from "@traceloop/instrumentation-pinecone";
import { BedrockInstrumentation } from "@traceloop/instrumentation-bedrock";
import {
  VertexAIInstrumentation,
  AIPlatformInstrumentation,
} from "@traceloop/instrumentation-vertexai";
import { CohereInstrumentation } from "@traceloop/instrumentation-cohere";

let _sdk: NodeSDK;
let _spanProcessor: SimpleSpanProcessor | BatchSpanProcessor;
let openAIInstrumentation: OpenAIInstrumentation;
let azureOpenAIInstrumentation: AzureOpenAIInstrumentation;
let llamaIndexInstrumentation: LlamaIndexInstrumentation;
let pineconeInstrumentation: PineconeInstrumentation;
let vertexaiInstrumentation: VertexAIInstrumentation;
let aiplatformInstrumentation: AIPlatformInstrumentation;
let langChainInstrumentation: LangChainInstrumentation;
let bedrockInstrumentation: BedrockInstrumentation;
let cohereInstrumentation: CohereInstrumentation;

const instrumentations: Instrumentation[] = [];

export const initInstrumentations = () => {
  openAIInstrumentation = new OpenAIInstrumentation();
  instrumentations.push(openAIInstrumentation);

  azureOpenAIInstrumentation = new AzureOpenAIInstrumentation();
  instrumentations.push(azureOpenAIInstrumentation);

  llamaIndexInstrumentation = new LlamaIndexInstrumentation();
  instrumentations.push(llamaIndexInstrumentation);

  pineconeInstrumentation = new PineconeInstrumentation();
  instrumentations.push(pineconeInstrumentation);

  vertexaiInstrumentation = new VertexAIInstrumentation();
  instrumentations.push(vertexaiInstrumentation);

  aiplatformInstrumentation = new AIPlatformInstrumentation();
  instrumentations.push(aiplatformInstrumentation);

  langChainInstrumentation = new LangChainInstrumentation();
  instrumentations.push(langChainInstrumentation);

  bedrockInstrumentation = new BedrockInstrumentation();
  instrumentations.push(bedrockInstrumentation);

  cohereInstrumentation = new CohereInstrumentation();
  instrumentations.push(cohereInstrumentation);
};

/**
 * Initializes the Traceloop SDK.
 * Must be called once before any other SDK methods.
 *
 * @param options - The options to initialize the SDK. See the {@link InitializeOptions} for details.
 * @throws {InitializationError} if the configuration is invalid or if failed to fetch feature data.
 */
export const startTracing = (options: InitializeOptions) => {
  if (!shouldSendTraces()) {
    openAIInstrumentation.setConfig({ traceContent: false });
    azureOpenAIInstrumentation.setConfig({ traceContent: false });
    llamaIndexInstrumentation.setConfig({ traceContent: false });
    vertexaiInstrumentation.setConfig({ traceContent: false });
    aiplatformInstrumentation.setConfig({ traceContent: false });
    bedrockInstrumentation.setConfig({ traceContent: false });
    cohereInstrumentation.setConfig({ traceContent: false });
  }

  const traceExporter =
    options.exporter ??
    new OTLPTraceExporter({
      url: `${options.baseUrl}/v1/traces`,
      headers: { Authorization: `Bearer ${options.apiKey}` },
    });
  _spanProcessor = options.disableBatch
    ? new SimpleSpanProcessor(traceExporter)
    : new BatchSpanProcessor(traceExporter);

  _spanProcessor.onStart = (span: Span) => {
    const workflowName = context.active().getValue(WORKFLOW_NAME_KEY);
    if (workflowName) {
      span.setAttribute(
        SpanAttributes.TRACELOOP_WORKFLOW_NAME,
        workflowName as string,
      );
    }

    const associationProperties = context
      .active()
      .getValue(ASSOCATION_PROPERTIES_KEY);
    if (associationProperties) {
      for (const [key, value] of Object.entries(associationProperties)) {
        span.setAttribute(
          `${SpanAttributes.TRACELOOP_ASSOCIATION_PROPERTIES}.${key}`,
          value,
        );
      }
    }
  };

  if (options.exporter) {
    Telemetry.getInstance().capture("tracer:init", {
      exporter: "custom",
      processor: options.disableBatch ? "simple" : "batch",
    });
  } else {
    Telemetry.getInstance().capture("tracer:init", {
      exporter: options.baseUrl ?? "",
      processor: options.disableBatch ? "simple" : "batch",
    });
  }

  _sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: options.appName,
    }),
    spanProcessor: _spanProcessor,
    traceExporter,
    instrumentations,
    sampler: new TraceloopSampler(),
  });

  _sdk.start();

  if (options.instrumentModules?.openAI) {
    openAIInstrumentation.manuallyInstrument(options.instrumentModules.openAI);
  }

  if (options.instrumentModules?.llamaIndex) {
    llamaIndexInstrumentation.manuallyInstrument(
      options.instrumentModules.llamaIndex,
    );
  }

  if (options.instrumentModules?.pinecone) {
    pineconeInstrumentation.manuallyInstrument(
      options.instrumentModules.pinecone,
    );
  }

  if (options.instrumentModules?.google_vertexai) {
    vertexaiInstrumentation.manuallyInstrument(
      options.instrumentModules.google_vertexai,
    );
  }

  if (options.instrumentModules?.google_aiplatform) {
    aiplatformInstrumentation.manuallyInstrument(
      options.instrumentModules.google_aiplatform,
    );
  }

  if (options.instrumentModules?.bedrock) {
    bedrockInstrumentation.manuallyInstrument(
      options.instrumentModules.bedrock,
    );
  }

  if (options.instrumentModules?.cohere) {
    cohereInstrumentation.manuallyInstrument(options.instrumentModules.cohere);
  }
};

export const shouldSendTraces = () => {
  if (!_configuration) {
    console.log("Warning: Traceloop not initialized");
    return false;
  }

  if (
    _configuration.traceContent === false ||
    (process.env.TRACELOOP_TRACE_CONTENT || "true").toLowerCase() === "false"
  ) {
    return false;
  }

  return true;
};

export const forceFlush = async () => {
  await _spanProcessor.forceFlush();
};
