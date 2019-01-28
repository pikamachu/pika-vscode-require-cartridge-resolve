import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import BaseDefinitionProvider, { DefinitionConfig, DefinitionItem, ResolvedLocation } from "./BaseDefinitionProvider";

const SYMBOL_DEFINITION_TYPE_TEXT = "symbol definitions";
const DEFINITION_TYPE_TEXT = "definitions";

const RESOLVED_TYPE_MATCH = "MATCH";
const RESOLVED_TYPE_INCLUDES = "INCLUDES";
const RESOLVED_TYPE_COMPLETION = "COMPLETION";

const MAX_EXTRACT_REGEX_LOOP = 10;

const defaultDefinitionConfig: DefinitionConfig = {
  symbolWordRangeRegex: /([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]*)/,
  symbolIdentifyRegex: /.+/,
  symbolIdentifyMatchPathPosition: 0,
  symbolElementDefinitionRegexTemplate: "(export)?\\s*(function|static)\\s*({symbolElementName})\\s*\\(",
  symbolNameRegexTemplate: "({symbolElementName}[a-zA-Z0-9_-]*)",
  symbolNameMinSize: 5,
  isCommentRegex: /^\s*?(\/\*|\*|\/\/).*/,
  symbolExportedDefinitionRegex: /export|module\.exports/,
  symbolExportedExtractMethodRegexs: [/=\s*([a-zA-Z0-9_-]+)\s*;/, /\s*([a-zA-Z0-9_-]+)\s*:/g]
};

export default abstract class DefaultDefinitionProvider extends BaseDefinitionProvider {
  public constructor(extensionConfig = {}, definitionConfig = {}) {
    super(extensionConfig, definitionConfig);
    this._definitionConfig = Object.assign(this._definitionConfig, defaultDefinitionConfig);
  }

  protected async performProvideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.DefinitionLink[]> {
    let result = [];
    const definitionItem = await this.findCartridgeDefinitionItem(document, position);
    if (definitionItem && definitionItem.resolvedLocations) {
      definitionItem.resolvedLocations.forEach(resolvedLocation => {
        result.push({
          originSelectionRange: definitionItem.range,
          targetUri: vscode.Uri.file(resolvedLocation.filePath),
          targetRange: new vscode.Range(resolvedLocation.positionLine, 0, resolvedLocation.positionLine + 1, 1)
        } as vscode.DefinitionLink);
      });
    } else {
      const symbolDefinitionItem = await this.findSymbolDefinitionItem(document, position);
      if (symbolDefinitionItem && symbolDefinitionItem.resolvedLocations) {
        symbolDefinitionItem.resolvedLocations.forEach(resolvedLocation => {
          result.push({
            originSelectionRange: symbolDefinitionItem.range,
            targetUri: vscode.Uri.file(resolvedLocation.filePath),
            targetRange: new vscode.Range(resolvedLocation.positionLine, 0, resolvedLocation.positionLine + 1, 1)
          } as vscode.DefinitionLink);
        });
      }
    }
    return result;
  }

  protected async performProvideHover(document: vscode.TextDocument, position: vscode.Position) {
    let result = null;
    let definitionItem = null;
    let symbolDefinitionItem = null;
    definitionItem = await this.findCartridgeDefinitionItem(document, position);
    if (definitionItem && definitionItem.resolvedLocations) {
      result = this.createDefinitionHover(definitionItem, DEFINITION_TYPE_TEXT);
    } else {
      symbolDefinitionItem = await this.findSymbolDefinitionItem(document, position);
      if (symbolDefinitionItem && symbolDefinitionItem.resolvedLocations) {
        result = this.createDefinitionHover(symbolDefinitionItem, SYMBOL_DEFINITION_TYPE_TEXT);
      }
    }
    if (!result) {
      // Show hover info no definition found
      if (definitionItem) {
        result = this.createDefinitionHover(definitionItem, DEFINITION_TYPE_TEXT);
      } else if (symbolDefinitionItem) {
        result = this.createDefinitionHover(symbolDefinitionItem, SYMBOL_DEFINITION_TYPE_TEXT);
      }
    }
    return result;
  }

  protected createDefinitionHover(definitionItem: DefinitionItem, definitionTypeText: string): vscode.Hover {
    let content = "``` js";
    if (definitionItem.resolvedLocations && definitionItem.resolvedLocations.length > 0) {
      let lastFilePath = "";
      content += "\nϞϞ(๑⚈‿‿⚈๑)∩ - " + definitionTypeText;
      definitionItem.resolvedLocations.forEach(resolvedLocation => {
        if (resolvedLocation.filePath !== lastFilePath) {
          // Print resolved file path
          if (resolvedLocation.resolvedType === RESOLVED_TYPE_MATCH) {
            content += "\n'" + resolvedLocation.filePath + "' (" + resolvedLocation.positionLine + ")";
          } else if (resolvedLocation.resolvedType === RESOLVED_TYPE_INCLUDES) {
            content += "\n'" + resolvedLocation.filePath + "'";
          } else if (resolvedLocation.resolvedType === RESOLVED_TYPE_COMPLETION) {
            content += "\n'" + resolvedLocation.filePath + "'";
          }
          lastFilePath = resolvedLocation.filePath;
        }
        // Print resolved symbols details
        if (resolvedLocation.resolvedType === RESOLVED_TYPE_INCLUDES) {
          content += "\nDid you mean '" + resolvedLocation.positionLabel + "' (" + resolvedLocation.positionLine + ") ?";
        } else if (resolvedLocation.resolvedType === RESOLVED_TYPE_COMPLETION) {
          content += "\n" + resolvedLocation.positionLabel;
        }
      });
    } else {
      content += "\nϞϞ(๑⊙__☉๑)∩ - no " + definitionTypeText;
    }
    content += "```";
    return new vscode.Hover(content, definitionItem.range);
  }

  protected async performProvideCompletion(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    let result = [];
    const symbolDefinitionItem = await this.findSymbolDefinitionItem(document, position);
    if (symbolDefinitionItem && symbolDefinitionItem.resolvedLocations) {
      symbolDefinitionItem.resolvedLocations.forEach(resolvedLocation => {
        if (resolvedLocation && resolvedLocation.positionLabel) {
          result.push({ label: resolvedLocation.positionLabel } as vscode.CompletionItem);
        }
      });
    }
    return result;
  }

  protected async findCartridgeDefinitionItem(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<DefinitionItem> {
    let result = null;
    try {
      let range = document.getWordRangeAtPosition(position, this._definitionConfig.wordRangeRegex);
      if (range && !range.isEmpty) {
        const lineText = document.lineAt(position.line).text;
        result = this.getDefinitionItemResultFromStore(lineText, document.fileName);
        if (!result) {
          let definitionItem = await this.identifyDefinitionItem(lineText);
          result = await this.processDefinitionItem(definitionItem, document, range);
        }
      }
    } catch (error) {
      this.logError(error);
    }
    return result;
  }

  protected async findSymbolDefinitionItem(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<DefinitionItem> {
    let result = null;
    try {
      let range = document.getWordRangeAtPosition(position, this._definitionConfig.symbolWordRangeRegex);
      if (range && !range.isEmpty) {
        const symbolStatement = document.getText(range);
        const lineText = document.lineAt(position.line).text;
        result = this.getDefinitionItemResultFromStore(lineText, document.fileName);
        if (!result) {
          let definitionItem = await this.identifySymbolDefinitionProvider(position, document, symbolStatement);
          result = await this.processDefinitionItem(definitionItem, document, range);
        }
      }
    } catch (error) {
      this.logError(error);
    }
    return result;
  }

  protected async identifySymbolDefinitionProvider(
    position: vscode.Position,
    document: vscode.TextDocument,
    symbolStatement: string
  ): Promise<DefinitionItem> {
    var symbolDefinitionItem: DefinitionItem = null;
    let positionLine = position.line;
    const referenceName = symbolStatement.substring(0, symbolStatement.indexOf("."));
    while (!symbolDefinitionItem && positionLine >= 0) {
      var lineText = document.lineAt(positionLine).text;
      if (this.identifySimpleSearch(lineText, referenceName)) {
        const definitionItem = await this.identifyDefinitionItem(lineText);
        if (definitionItem) {
          symbolDefinitionItem = definitionItem;
          symbolDefinitionItem.symbolStatement = symbolStatement;
          symbolDefinitionItem.symbolReferenceName = referenceName;
          symbolDefinitionItem.symbolElementName = symbolStatement.substring(symbolStatement.indexOf(".") + 1);
        }
      }
      positionLine = positionLine - 1;
    }
    if (!symbolDefinitionItem) {
      this.logDebug(
        "Require statement reference name " + referenceName + " not found. Ignoring symbol statement " + symbolStatement
      );
    }
    return symbolDefinitionItem;
  }

  protected async processDefinitionItem(
    definitionItem: any,
    document: vscode.TextDocument,
    range: vscode.Range
  ): Promise<DefinitionItem> {
    let result = definitionItem;
    if (definitionItem) {
      this.logInfo("Processing " + definitionItem.type + " statement " + definitionItem.statement);
      definitionItem.documentFileName = document.fileName;
      // Check if file exists on current cartridge
      let resolvedLocations: ResolvedLocation[] = [];
      const filePath = await this.resolveCurrentCartridgeFilePath(definitionItem);
      if (filePath) {
        const resolvedSymbolLocation = await this.resolveSymbolLocation(filePath, definitionItem);
        resolvedLocations.push(...resolvedSymbolLocation);
      } else {
        // Trying to find file on workspace cartridges
        const filePaths = await this.findCartridgeHierachyFilePaths(definitionItem);
        if (filePaths && filePaths.length > 0) {
          for (let index = 0; index < filePaths.length; index++) {
            const filePath = filePaths[index];
            const resolvedSymbolLocation = await this.resolveSymbolLocation(filePath, definitionItem);
            resolvedLocations.push(...resolvedSymbolLocation);
          }
        }
      }
      if (resolvedLocations && resolvedLocations.length > 0) {
        this.logInfo(
          "Resolved locations: " + resolvedLocations[0].filePath + " (" + resolvedLocations[0].positionLine + ")."
        );
        result = this.storeDefinitionItem(definitionItem, resolvedLocations, range);
      }
    }
    return result;
  }

  protected async resolveSymbolLocation(filePath: string, definitionItem: DefinitionItem): Promise<ResolvedLocation[]> {
    let resolvedLocations = [];

    const symbolElementName = definitionItem.symbolElementName;
    if (symbolElementName || symbolElementName === "") {
      const resolvedDocument = await vscode.workspace.openTextDocument(filePath);
      if (resolvedDocument) {
        if (this.isSymbolNameSearcheable(symbolElementName)) {
          // if symbol has enought char search it on document
          resolvedLocations = this.searchDocumentSymbolsDefinitions(resolvedDocument, symbolElementName, filePath);
        } else {
          // Parse all document symbols and then filter by symbolElementName
          resolvedLocations = this.parseDocumentSymbolsDefinitions(resolvedDocument, symbolElementName, filePath);
        }
      }
    }

    if (resolvedLocations.length === 0) {
      resolvedLocations.push({ filePath: filePath, positionLine: 0 } as ResolvedLocation);
    }

    return resolvedLocations;
  }

  protected isSymbolNameSearcheable(symbolElementName: string): boolean {
    return symbolElementName.length >= this._definitionConfig.symbolNameMinSize;
  }

  protected searchDocumentSymbolsDefinitions(
    resolvedDocument: vscode.TextDocument,
    symbolElementName: string,
    filePath: string
  ): ResolvedLocation[] {
    let resolvedLocations = [];

    let softSymbolElementNamesFound = [];
    const symbolElementDefinitionRegex = this.createSymbolElementDefinitionRegex(symbolElementName);
    const resolvedDocumentLines = resolvedDocument.lineCount;
    for (let line = 0; line < resolvedDocumentLines; line++) {
      const lineText = resolvedDocument.lineAt(line).text;
      if (lineText.includes(symbolElementName)) {
        if (symbolElementDefinitionRegex.test(lineText)) {
          this.logDebug("Symbol element match definition found at position " + line + " line text: ", lineText);
          resolvedLocations = [
            {
              filePath: filePath,
              resolvedType: RESOLVED_TYPE_MATCH,
              positionLine: line,
              positionText: lineText,
              positionLineIndex: 0,
              positionLabel: symbolElementName
            } as ResolvedLocation
          ];
          break;
        } else if (!this.isTextComment(lineText)) {
          this.logDebug("Symbol element soft definition found at position " + line + " line text: ", lineText);
          // Adding soft match to location list
          const softSymbolElementName = this.extractCompleteSymbolElementName(symbolElementName, lineText);
          if (!(softSymbolElementNamesFound.indexOf(softSymbolElementName) > -1)) {
            softSymbolElementNamesFound.push(softSymbolElementName);
            resolvedLocations.push({
              filePath: filePath,
              resolvedType: RESOLVED_TYPE_INCLUDES,
              positionLine: line,
              positionText: lineText,
              positionLineIndex: 0,
              positionLabel: softSymbolElementName
            } as ResolvedLocation);
          }
        }
      }
    }

    return resolvedLocations;
  }

  protected parseDocumentSymbolsDefinitions(
    resolvedDocument: vscode.TextDocument,
    symbolElementName: string,
    filePath: string
  ): ResolvedLocation[] {
    let resolvedLocations = [];
    const resolvedDocumentLines = resolvedDocument.lineCount;
    for (let line = 0; line < resolvedDocumentLines; line++) {
      let lineText = resolvedDocument.lineAt(line).text;
      if (lineText.includes("export")) {
        if (this._definitionConfig.symbolExportedDefinitionRegex.test(lineText)) {
          this.logDebug("Symbol exported match found at position " + line + " line text: ", lineText);
          let endLoop = false;
          while (!endLoop) {
            this._definitionConfig.symbolExportedExtractMethodRegexs.forEach(extractRegex => {
              resolvedLocations.push(...this.extractSymbolLabels(extractRegex, lineText, line, filePath));
            });
            line++;
            if (
              lineText.includes("}") ||
              lineText.includes(";") ||
              lineText.trim().length === 0 ||
              line >= resolvedDocument.lineCount
            ) {
              endLoop = true;
            } else {
              lineText = resolvedDocument.lineAt(line).text;
            }
          }
        }
      }
    }

    return resolvedLocations;
  }

  protected extractSymbolLabels(extractRegex: RegExp, lineText: string, line: number, filePath: string) {
    let resolvedLocations = [];
    let match, lastMatch, i = 0, endMatch = false;
    while ((match = extractRegex.exec(lineText)) !== null && !endMatch && i < MAX_EXTRACT_REGEX_LOOP) {
      if (match.length > 1 && lastMatch !== match[1]) {
        this.logDebug("Symbol element match definition " + match[1] + " found at position " + line + " line text: ", lineText);
        resolvedLocations.push({
          filePath: filePath,
          resolvedType: RESOLVED_TYPE_COMPLETION,
          positionLine: line,
          positionText: lineText,
          positionLineIndex: 0,
          positionLabel: match[1]
        } as ResolvedLocation);
        lastMatch = match[1];
      }
      else {
        endMatch = true;
      }
      i++;
    }
    return resolvedLocations;
  }

  protected isTextComment(lineText: string): boolean {
    return this._definitionConfig.isCommentRegex.test(lineText);
  }

  protected extractCompleteSymbolElementName(symbolElementName: string, lineText: string): string {
    let result = symbolElementName;
    const symbolNameRegexTemplate = this._definitionConfig.symbolNameRegexTemplate;
    const symbolNameRegex = new RegExp(symbolNameRegexTemplate.replace("{symbolElementName}", symbolElementName));
    let match = symbolNameRegex.exec(lineText);
    if (match) {
      result = match[0];
    }
    return result;
  }

  protected createSymbolElementDefinitionRegex(symbolElementName: string): RegExp {
    const symbolElementDefinitionTemplate = this._definitionConfig.symbolElementDefinitionRegexTemplate;
    return new RegExp(symbolElementDefinitionTemplate.replace("{symbolElementName}", symbolElementName));
  }

  protected identifySimpleSearch(lineText: string, referenceName: string): boolean {
    return (
      lineText && lineText.includes(this._definitionConfig.identifySimpleSearch) && lineText.includes(referenceName)
    );
  }

  protected identifyDefinitionItem(lineText: string): Promise<DefinitionItem> {
    const config = this._definitionConfig;
    return new Promise((resolve, reject) => {
      let result = null;

      let match = config.identifyRegex.exec(lineText);
      if (match && match.length >= config.identifyMatchPathPosition) {
        result = {
          lineText: lineText,
          statement: match[0],
          path: match[config.identifyMatchPathPosition - 1],
          type: config.identifyType
        };
      }

      resolve(result);
    });
  }

  protected resolveCurrentCartridgeFilePath(definitionItem: DefinitionItem): Promise<string> {
    if (definitionItem && definitionItem.path) {
      const cartridgeFolder = this._definitionConfig.cartridgeFolder;
      return new Promise((resolve, reject) => {
        try {
          // Create file path
          const fileName = definitionItem.documentFileName;
          let initialPath = fileName.substring(0, fileName.indexOf(cartridgeFolder + path.sep));
          if (!initialPath || initialPath === "") {
            initialPath = vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri.fsPath;
          }
          let filePath = this.normalizePath(
            initialPath + cartridgeFolder + definitionItem.path + this.resolveExtension(definitionItem)
          );
          // Check if file path exists
          fs.stat(filePath, (error, stat) => {
            let resolvedFilePath = null;
            if (!error) {
              resolvedFilePath = filePath;
            }
            return resolve(resolvedFilePath);
          });
        } catch (error) {
          this.logInfo("resolveCurrentCartridgeFilePath: " + error);
          return resolve(null);
        }
      });
    } else {
      return Promise.reject("resolveCurrentCartridgeFilePath: File path is undefined");
    }
  }

  protected findCartridgeHierachyFilePaths(definitionItem: DefinitionItem): Promise<string[]> {
    if (definitionItem && definitionItem.path) {
      const cartridgeFolder = this._definitionConfig.cartridgeFolder;
      return new Promise((resolve, reject) => {
        try {
          const includePattern = this.normalizePath(
            "**/" + cartridgeFolder + "/**" + definitionItem.path + this.resolveExtension(definitionItem)
          );
          vscode.workspace.findFiles(includePattern, "**/node_modules/**").then(files => {
            let resolvedFilePaths: string[] = [];
            if (files && files.length > 0) {
              files.forEach(file => {
                if (file.fsPath !== definitionItem.documentFileName) {
                  // Include all files except current document
                  resolvedFilePaths.push(this.normalizePath(file.fsPath));
                }
              });
            }
            return resolve(resolvedFilePaths);
          });
        } catch (error) {
          this.logInfo("findCartridgeHierachyFilePaths: " + error);
          return resolve(null);
        }
      });
    } else {
      return Promise.reject("findCartridgeHierachyFilePaths: File path is undefined");
    }
  }

  protected resolveExtension(definitionItem: DefinitionItem): string {
    const documentFileName = definitionItem.documentFileName;
    const addExtension = definitionItem.path.indexOf(".") <= 0;
    return addExtension ? documentFileName.substring(documentFileName.lastIndexOf(".")) : "";
  }

  protected normalizePath(path: string): string {
    return path.replace(/\\/g, "/");
  }
}
