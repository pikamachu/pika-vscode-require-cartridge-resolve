# [Require Cartridge Resolve](https://github.com/pikamachu/pika-vscode-require-cartridge-resolve)

[![Version](https://vsmarketplacebadge.apphb.com/version/pikamachu.require-cartridge-resolve.svg)](https://marketplace.visualstudio.com/items?itemName=pikamachu.require-cartridge-resolve)
[![Build Status](https://img.shields.io/travis/pikamachu/pika-vscode-require-cartridge-resolve/master.svg)](https://travis-ci.org/pikamachu/pika-vscode-require-cartridge-resolve)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/7a5d465f487e4f55a8e50e8201cc69b1)](https://www.codacy.com/project/antonio.marin.jimenez/pika-vscode-require-cartridge-resolve/dashboard?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=pikamachu/pika-vscode-require-cartridge-resolve&amp;utm_campaign=Badge_Grade_Dashboard)

## Introduction

Provides definitions for SFRA cartridge require files in your code for quick navigation.

## Features

- Adds quick navigation features to cartridge script and isml files.
- Resolves simple cartridge hierarchy.
- Supports the following statements definitions: 
  - require(*/cartridge/...)
  - module.superModule

## Usage

Open the folder containing the cartridges you want to work. This extension only resolves the cartridge hierachy inside this folder.

You can navigate to the cartridge file in 2 ways:

- Set your cursor inside to the cartridge file name string and click F12.
- Hold CMD or CTRL key and hover over the cartridge file name. It will become underlined if the cartridge file is resolved and it will show the popup with the code lens.

## Changelist

### 1.0.0

- Initial release

### 1.1.0

- Adding module.superModule statement definition support.

## Configuration

You can configure this plugin via the "require.cartridge.resolve" properties in your workspace/user preferences.
