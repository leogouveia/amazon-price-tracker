import "dotenv/config";
import { runPriceMonitor } from "./monitor";

runPriceMonitor()
  .then((result) => {
    console.log(
      `\nConcluído: ${result.checked} produto(s), ${result.errors.length} erro(s), ${result.durationMs}ms`,
    );

    if (result.errors.length > 0) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error("Erro: ", error);
    process.exit(1);
  });
