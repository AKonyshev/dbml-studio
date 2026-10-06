let input = "";
process.stdin.on("data", (chunk) => (input += String(chunk)));
process.stdin.on("end", () => {
  const { blocks } = JSON.parse(input);
  const findings = blocks
    .filter((block) => block.text.includes("BROKEN"))
    .map((block) => ({
      id: block.id,
      model: block.model,
      problem: "the model is BROKEN",
    }));
  process.stdout.write(JSON.stringify({ findings }));
});
