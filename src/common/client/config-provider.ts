// Interface to hopefully allow us to swap out SSM to APP config later
export interface ConfigProvider {
  getConfig: (parameterPath: string) => Promise<Record<string, string>>
}
