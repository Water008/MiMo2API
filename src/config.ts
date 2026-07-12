export interface MimoAccount {
  service_token: string;
  user_id: string;
  xiaomichatbot_ph: string;
}

export interface Config {
  api_keys: string;
  admin_password: string;
  mimo_accounts: MimoAccount[];
  models: string[];
}

export class ConfigManager {
  private config_file: string;
  private config: Config;
  private account_idx: number = 0;
  private isWriting: boolean = false;
  private writeQueue: (() => void)[] = [];

  constructor(config_file: string = "config.json") {
    this.config_file = config_file;
    this.config = {
      api_keys: "sk-default",
      admin_password: "admin",
      mimo_accounts: [],
      models: ["mimo-v2-flash-studio"],
    };
  }

  async load(): Promise<void> {
    try {
      const data = await Deno.readTextFile(this.config_file);
      const parsedData = JSON.parse(data);
      this.config = {
        api_keys: parsedData.api_keys || "sk-default",
        admin_password: parsedData.admin_password || "admin",
        mimo_accounts: parsedData.mimo_accounts || [],
        models: parsedData.models && Array.isArray(parsedData.models) && parsedData.models.length > 0 ? parsedData.models : ["mimo-v2-flash-studio"],
      };
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        console.log(`Config file not found, creating default at ${this.config_file}`);
        await this.save();
      } else {
        console.error(`Failed to load config: ${e}`);
        await this.save();
      }
    }
  }

  async save(): Promise<void> {
    return new Promise((resolve, reject) => {
      const doWrite = async () => {
        this.isWriting = true;
        try {
          await Deno.writeTextFile(
            this.config_file,
            JSON.stringify(this.config, null, 2)
          );
          resolve();
        } catch (e) {
          console.error(`Failed to save config: ${e}`);
          reject(e);
        } finally {
          this.isWriting = false;
          if (this.writeQueue.length > 0) {
            const next = this.writeQueue.shift();
            if (next) next();
          }
        }
      };

      if (this.isWriting) {
        this.writeQueue.push(doWrite);
      } else {
        doWrite();
      }
    });
  }

  validate_api_key(key: string): boolean {
    const keys = this.config.api_keys.split(",").map((k) => k.trim());
    return keys.includes(key);
  }

  get_next_account(): MimoAccount | null {
    if (!this.config.mimo_accounts || this.config.mimo_accounts.length === 0) {
      return null;
    }
    const account =
      this.config.mimo_accounts[
        this.account_idx % this.config.mimo_accounts.length
      ];
    this.account_idx += 1;
    return account;
  }

  async update_config(new_config: Partial<Config>): Promise<void> {
    this.config = {
      api_keys: new_config.api_keys || this.config.api_keys,
      admin_password: new_config.admin_password || this.config.admin_password,
      mimo_accounts: new_config.mimo_accounts || this.config.mimo_accounts,
      models: new_config.models || this.config.models,
    };
    await this.save();
  }

  get_config(): Config {
    return { ...this.config };
  }
}

// Global config manager instance
export const config_manager = new ConfigManager();
// Await load before starting server in main
