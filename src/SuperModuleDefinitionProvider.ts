import * as path from "path";
import DefaultDefinitionProvider from "./DefaultDefinitionProvider";
import {DefinitionConfig, DefinitionItem} from "./BaseDefinitionProvider";

const superModuleDefinitionConfig: DefinitionConfig = { 
  wordRangeRegex: /module\.superModule/,
  identifySimpleSearch: "superModule",
  identifyRegex: /module\.superModule/,
  identifyMatchPathPosition: 0,
  identifyType: "superModule"
};

/**
 * Definition Provider for scripts related to module.superModule statements.
 * @example
 * var base = module.superModule;
 * 
 */
export default class SuperModuleDefinitionProvider extends DefaultDefinitionProvider {
  public constructor(extensionConfig = {}, definitionConfig = {}) {
    super(extensionConfig, definitionConfig);
    this._definitionConfig = Object.assign(this._definitionConfig, superModuleDefinitionConfig);
    super._providerClass = "SuperModule";
  }

  protected resolveCurrentCartridgeFilePath(definitionItem: DefinitionItem): Promise<string> {
    return Promise.resolve(null);
  }

  protected findCartridgeHierachyFilePaths(definitionItem: DefinitionItem): Promise<string[]> {
    definitionItem.path = this.getSuperModulePath(definitionItem);
    return super.findCartridgeHierachyFilePaths(definitionItem);
  }

  protected getSuperModulePath(definitionItem: DefinitionItem): string {
    const cartridgeFolderPlusSeparator = this._definitionConfig.cartridgeFolder + path.sep;
    const documentFileName = definitionItem.documentFileName;
    const filePathBeginIndex = documentFileName.indexOf(cartridgeFolderPlusSeparator)
      + (cartridgeFolderPlusSeparator.length - 1);
    return documentFileName.substring(filePathBeginIndex).replace(/\\/g, "/");
  }
}
