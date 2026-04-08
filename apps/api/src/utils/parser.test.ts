import { describe, expect, it } from "vitest";

import { buildFingerprint } from "./fingerprint.js";
import { parseDlqMessage } from "./parser.js";
import { sanitizeText } from "./sanitize.js";

const sampleMessage = `
NEW DLQ MESSAGE
KAFKA-UI
TOPIC: prod-cross-crm-sales-salesforce-inbound-events-v1
KIND: OLX_INBOUND_ACCOUNT_UPDATE
DATA: N/A
KEY: 176e0e08-c7d9-4cde-968c-d406bbc1847f
Error Message:
{"compositeResponse":[{"body":[{"message":"invalid cross reference id","errorCode":"INVALID_CROSS_REFERENCE_KEY"}],"httpStatusCode":404}]}
Error Response:
\`\`\`
*Error Stack:*
\`\`\`CompositeError: {"compositeResponse":[{"body":[{"message":"invalid cross reference id"}],"httpStatusCode":404}]}
 at /usr/src/app/consumer/libs/salesforce.service.js:115:23
Curl:
curl --request POST https://crm-api.prod.example.com --header 'Authorization: bearer secret-token'
`;

describe("parseDlqMessage", () => {
  it("extracts the main DLQ sections", () => {
    const parsed = parseDlqMessage(sampleMessage);

    expect(parsed).not.toBeNull();
    expect(parsed?.source).toBe("KAFKA-UI");
    expect(parsed?.topic).toBe("prod-cross-crm-sales-salesforce-inbound-events-v1");
    expect(parsed?.kind).toBe("OLX_INBOUND_ACCOUNT_UPDATE");
    expect(parsed?.messageKey).toBe("176e0e08-c7d9-4cde-968c-d406bbc1847f");
    expect(parsed?.errorMessage).toContain("invalid cross reference id");
    expect(parsed?.curl).toContain("Authorization");
  });

  it("supports optional external reference fields", () => {
    const parsed = parseDlqMessage(`
      NEW DLQ MESSAGE
      KAFKA-UI
      TOPIC: CRM_CONTRACT
      KIND: CONTRACT_CANCELLATION_REQUESTED
      KEY: abc
      EXTERNAL REFERENCE: 800U500000f04SyIAK
      Error Message:
      Request failed with status code 400
    `);

    expect(parsed?.externalReference).toBe("800U500000f04SyIAK");
  });

  it("parses inline section labels when the copied Slack text has no line break between sections", () => {
    const parsed = parseDlqMessage(
      'NEW DLQ MESSAGE\nKAFKA-UI\nTOPIC: prod-cross-crm-sales-salesforce-inbound-events-v1\nKIND: OLX_INBOUND_ACCOUNT_UPDATE\nKEY: 176e0e08-c7d9-4cde-968c-d406bbc1847f\nError Message: {"compositeResponse":[{"body":[{"message":"invalid cross reference id","errorCode":"INVALID_CROSS_REFERENCE_KEY","fields":[]}],"httpHeaders":{},"httpStatusCode":404,"referenceId":"UpdatedAccount"}]}Error Response:  ```\n*Error Stack:*\n```CompositeError: {"compositeResponse":[{"body":[{"message":"invalid cross reference id","errorCode":"INVALID_CROSS_REFERENCE_KEY","fields":[]}],"httpHeaders":{},"httpStatusCode":404,"referenceId":"UpdatedAccount"}]}Curl: curl --data \'{"body":{"Name":"Ana Ana"}}\'',
    );

    expect(parsed?.errorMessage).toContain("INVALID_CROSS_REFERENCE_KEY");
    expect(parsed?.errorMessage).not.toContain("Curl:");
    expect(parsed?.errorResponse).toContain("```");
    expect(parsed?.errorStack).toContain("CompositeError");
    expect(parsed?.curl).toContain("Ana Ana");
  });
});

describe("sanitizeText", () => {
  it("masks secrets in free text", () => {
    const sanitized = sanitizeText(
      "Authorization: Bearer secret-token cookie=session=abc token=my-token",
    );

    expect(sanitized).toContain("Bearer ***");
    expect(sanitized).not.toContain("secret-token");
    expect(sanitized).not.toContain("my-token");
  });
});

describe("buildFingerprint", () => {
  it("normalizes variable values so equivalent errors collapse into one signature", () => {
    const first = buildFingerprint({
      topic: "topic-a",
      kind: "kind-a",
      errorMessage: "Cannot read properties of undefined id 12345",
      errorResponse: null,
      errorStack: "TypeError at 176e0e08-c7d9-4cde-968c-d406bbc1847f",
    });

    const second = buildFingerprint({
      topic: "topic-a",
      kind: "kind-a",
      errorMessage: "Cannot read properties of undefined id 67890",
      errorResponse: null,
      errorStack: "TypeError at 268e0e08-c7d9-4cde-968c-d406bbc1847f",
    });

    expect(first).toBe(second);
  });

  it("groups equivalent DLQs even when curl payload and record ids differ", () => {
    const first = buildFingerprint({
      topic: "prod-cross-crm-sales-salesforce-inbound-events-v1",
      kind: "OLX_INBOUND_ACCOUNT_UPDATE",
      errorMessage:
        '{"compositeResponse":[{"body":[{"message":"invalid cross reference id","errorCode":"INVALID_CROSS_REFERENCE_KEY","fields":[]}],"httpHeaders":{},"httpStatusCode":404,"referenceId":"UpdatedAccount"}]}',
      errorResponse:
        '{"compositeResponse":[{"body":[{"message":"invalid cross reference id","errorCode":"INVALID_CROSS_REFERENCE_KEY","fields":[]}],"httpHeaders":{},"httpStatusCode":404,"referenceId":"UpdatedAccount"}]}',
      errorStack:
        'CompositeError: {"compositeResponse":[{"body":[{"message":"invalid cross reference id","errorCode":"INVALID_CROSS_REFERENCE_KEY","fields":[]}],"httpHeaders":{},"httpStatusCode":404,"referenceId":"UpdatedAccount"}]}\n at /usr/src/app/consumer/libs/salesforce/src/salesforce.service.js:115:23',
    });

    const second = buildFingerprint({
      topic: "prod-cross-crm-sales-salesforce-inbound-events-v1",
      kind: "OLX_INBOUND_ACCOUNT_UPDATE",
      errorMessage:
        '{"compositeResponse":[{"body":[{"message":"invalid cross reference id","errorCode":"INVALID_CROSS_REFERENCE_KEY","fields":[]}],"httpHeaders":{},"httpStatusCode":404,"referenceId":"UpdatedAccount"}]}',
      errorResponse:
        '{"compositeResponse":[{"body":[{"message":"invalid cross reference id","errorCode":"INVALID_CROSS_REFERENCE_KEY","fields":[]}],"httpHeaders":{},"httpStatusCode":404,"referenceId":"UpdatedAccount"}]}',
      errorStack:
        'CompositeError: {"compositeResponse":[{"body":[{"message":"invalid cross reference id","errorCode":"INVALID_CROSS_REFERENCE_KEY","fields":[]}],"httpHeaders":{},"httpStatusCode":404,"referenceId":"UpdatedAccount"}]}\n at /usr/src/app/consumer/libs/salesforce/src/salesforce.service.js:999:99',
    });

    expect(first).toBe(second);
  });

  it("separates genuinely different error categories", () => {
    const first = buildFingerprint({
      topic: "prod-cross-crm-sales-salesforce-inbound-events-v1",
      kind: "OLX_INBOUND_ACCOUNT_UPDATE",
      errorMessage:
        '{"compositeResponse":[{"body":[{"message":"invalid cross reference id","errorCode":"INVALID_CROSS_REFERENCE_KEY","fields":[]}],"httpHeaders":{},"httpStatusCode":404,"referenceId":"UpdatedAccount"}]}',
      errorResponse: null,
      errorStack: null,
    });

    const second = buildFingerprint({
      topic: "prod-cross-crm-sales-salesforce-inbound-events-v1",
      kind: "OLX_INBOUND_ACCOUNT_UPDATE",
      errorMessage:
        '{"compositeResponse":[{"body":[{"message":"Campos obrigatórios ausentes: [Name]","errorCode":"REQUIRED_FIELD_MISSING","fields":["Name"]}],"httpHeaders":{},"httpStatusCode":400,"referenceId":"UpdatedAccount"}]}',
      errorResponse: null,
      errorStack: null,
    });

    expect(first).not.toBe(second);
  });

  it("produces the same fingerprint for the two inline Slack examples that only differ by payload values", () => {
    const first = parseDlqMessage(
      'NEW DLQ MESSAGE\nKAFKA-UI\nTOPIC: prod-cross-crm-sales-salesforce-inbound-events-v1\nKIND: OLX_INBOUND_ACCOUNT_UPDATE\nKEY: 176e0e08-c7d9-4cde-968c-d406bbc1847f\nError Message: {"compositeResponse":[{"body":[{"message":"invalid cross reference id","errorCode":"INVALID_CROSS_REFERENCE_KEY","fields":[]}],"httpHeaders":{},"httpStatusCode":404,"referenceId":"UpdatedAccount"}]}Error Response:  ```\n*Error Stack:*\n```CompositeError: {"compositeResponse":[{"body":[{"message":"invalid cross reference id","errorCode":"INVALID_CROSS_REFERENCE_KEY","fields":[]}],"httpHeaders":{},"httpStatusCode":404,"referenceId":"UpdatedAccount"}]}Curl: curl --data \'{"body":{"Name":"Ana Ana","IdOrigin__c":"23179649"}}\'',
    )!;

    const second = parseDlqMessage(
      'NEW DLQ MESSAGE\nKAFKA-UI\nTOPIC: prod-cross-crm-sales-salesforce-inbound-events-v1\nKIND: OLX_INBOUND_ACCOUNT_UPDATE\nKEY: 64e49118-0262-49f9-b721-f41197e54f64\nError Message: {"compositeResponse":[{"body":[{"message":"invalid cross reference id","errorCode":"INVALID_CROSS_REFERENCE_KEY","fields":[]}],"httpHeaders":{},"httpStatusCode":404,"referenceId":"UpdatedAccount"}]}Error Response:  ```\n*Error Stack:*\n```CompositeError: {"compositeResponse":[{"body":[{"message":"invalid cross reference id","errorCode":"INVALID_CROSS_REFERENCE_KEY","fields":[]}],"httpHeaders":{},"httpStatusCode":404,"referenceId":"UpdatedAccount"}]}Curl: curl --data \'{"body":{"Name":"Credfacil Credfacil","IdOrigin__c":"104952112"}}\'',
    )!;

    const firstFingerprint = buildFingerprint(first);
    const secondFingerprint = buildFingerprint(second);

    expect(firstFingerprint).toBe(secondFingerprint);
  });
});
