import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "render-worker";
export default defineRailway(() => {
  const renderWorker = service("render-worker", {
    // dockerfilePath from CaC: "workers/render/Dockerfile"
    // builder from CaC: "DOCKERFILE"
    source: github("devTam/beyonddverse", { branch: "main" }),
    healthcheck: "/ready",
    healthcheckTimeout: 120,
    replicas: { "europe-west4-drams3a": 1 },
  });

  return project("desirable-acceptance", {
    variables: { managed: false },
    resources: [renderWorker],
  });
});
