import { readFileSync, createWriteStream, writeFile } from "fs";
import * as model from "./model";
const { createHash } = require("crypto");
import * as crypto from "crypto";
const { generateKeyPair } = require("crypto");
const createSign = require("crypto").createSign;
const createVerify = require("crypto").createVerify;
const requestLib = require("request");
import * as showdown from "showdown";
const sanitizeHtml = require('sanitize-html');

console.log("Reading config file");
export let config = JSON.parse(readFileSync("config.json", "UTF-8") as string);
console.log("Got config file");

export const port = config.port == undefined ? 9090 : config.port == "" ? "" : config.port;
export const realPort = config.realPort == undefined ? 9090 : config.realPort == "" ? "" : config.realPort;
export let protocol = config.protocol || "http";
export const host = config.host || "0.0.0.0";
export const generateTestData = !!config.generateTestData;
export let migrationNumber = config.migrationNumber || 0;

function saveConfig(){
    setTimeout(() => {
        writeFile("config.json", JSON.stringify(config, undefined, 4), "UTF-8", () => {});
    }, 0);
}
export function getServerName(): string { return config.serverName || "default server name" }
export function setServerName(name: string) {
    config.serverName = name;
    saveConfig();
}

export function setMigrationNumber(n: number) {
    migrationNumber = n;
    config.migrationNumber = migrationNumber;
    saveConfig();
}

export function getAdmins(): string[] { return config.admins || [] }
export function setAdmins(names: string[]) {
    config.admins = names;
    saveConfig();
}

export function getBlockNewInstances(): boolean { return config.blockNewInstances == undefined ? false : config.blockNewInstances }
export function setBlockNewInstances(block: boolean) {
    config.blockNewInstances = block;
    saveConfig();
}

export function getAcceptSignUp(): boolean { return config.acceptSignUp == undefined ? true : config.acceptSignUp }
export function setAcceptSignUp(accept: boolean) {
    config.acceptSignUp = accept;
    saveConfig();
}

export function getHeadHTML(): string { return config.headHTML || "" }
export function setHeadHTML(html: string) {
    config.headHTML = html;
    saveConfig();
}

export function getFooterHTML(): string { return config.footerHTML || "" }
export function setFooterHTML(html: string) {
    config.footerHTML = html;
    saveConfig();
}

export function getCustomCSS(): string { return config.customCSS || "" }
export function setCustomCSS(css: string) {
    config.customCSS = css;
    saveConfig();
}

// a list of branch names or a list of sections with a names and associated branches
export type OverviewBranches = string[] | {name: string, branches: string[]}[];
export function getOverviewBranches(): OverviewBranches {
    return config.overviewBranches;
}
export function setOverviewBranches(ob: OverviewBranches) {
    config.overviewBranches = ob;
    saveConfig();
}

export function getOverviewHasThreads(): boolean { return config.overviewHasThreads == undefined ? true : config.overviewHasThreads }
export function setOverviewHasThreads(accept: boolean) {
    config.overviewHasThreads = accept;
    saveConfig();
}

export const serverAddress = host + (port ? (":" + port) : "");

export let baseUrl = protocol + "://" + serverAddress;

import * as njk from "nunjucks";
njk.configure("src", {autoescape: true});


export function urlForPath(path: string): string{
    return baseUrl + "/" + path;
}

export function last<A>(list: A[]): A {
    return list[list.length-1];
}

let logStream = createWriteStream("log.txt", {flags: "a"});

export function log(...args: any[]){
    logStream.write( new Date().toISOString() + ": " );
    logStream.write( args.map(e => JSON.stringify(e)).join(" ") );
    logStream.write( "\n" );
}

export interface KeyPair {
    publicKey: string,
    privateKey: string
}
export function generateUserKeyPair(): Promise<KeyPair> {
    return new Promise((resolve, reject) => {
        generateKeyPair('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {
              type: 'pkcs1',
              format: 'pem'
            },
            privateKeyEncoding: {
              type: 'pkcs1',
              format: 'pem',
            }
        }, (err: any, publicKey: string, privateKey: string) => {
            resolve({
                publicKey,
                privateKey
            });
        });
    });
}

export function sha256(str: string): string {
    return createHash("sha256").update(str, "utf8").digest("base64");
}

export function signString(key: string, content: string): string {
    let sign = createSign("RSA-SHA256");
    sign.update(content);
    
    return sign.sign(key, "base64");
}

export function verifyString(key: string, signature: string, content: string): boolean {
    let verify = createVerify("RSA-SHA256");
    verify.update(content);
    
    return verify.verify(key, signature, "base64");
}

export function endWithRedirect(res: any, url: string): void{
    res.statusCode = 303;
    res.setHeader("Location", url);
    res.end();
}

export async function getLoggedUser(cookies: {[key: string]: string}): Promise<model.User | undefined> {
    if (cookies.session) {
        let session = await model.getSessionById(cookies.session);
        if (session && session.userName) {
            let user = await model.getUserByName(session.userName);
            if (user) {
                return user;
            }
        }
    }
    
    return undefined;
}

export function parseCookies(cookie: string): {[key: string]: string} {
    return cookie.split(';').reduce(
        function(prev: any, curr: any) {
            var m = / *([^=]+)=(.*)/.exec(curr) as any;
            var key = m[1];
            var value = decodeURIComponent(m[2]);
            prev[key] = value;
            return prev;
        },
        { }
    );
}

export function stringifyCookies(cookies: {[key: string]: string}): string {
    var list = [];
    for (var key in cookies) {
        list.push(key + '=' + encodeURIComponent(cookies[key]));
    }
    return list.join('; ');
}

export function renderTemplate(templatePath: string, viewData: any): string {
    return njk.render(templatePath, {
        serverName: getServerName(),
        acceptSignUp: getAcceptSignUp(),
        headHTML: getHeadHTML(),
        footerHTML: getFooterHTML(),
        customCSS: getCustomCSS(),
            
        utils: {
            encodeURIComponent: encodeURIComponent,
            threadLink: (id: string) => {
                if (id.split("/")[2] == serverAddress)
                    return id;
                else
                    return "/thread/" + encodeURIComponent(id);
            },
            renderMarkdown: renderMarkdown,
            renderUserName: (name: string) => {
                if (name.indexOf("@"+serverAddress) == -1)
                    return name;
                else
                    return name.substr(0, name.indexOf("@"+host));
            },
            renderRelativeTime: (date: number) => {
                let days = (new Date().getTime() - date) / (1000 * 60 * 60 * 24);
                days = Math.floor(days);
                
                if (days > 1)
                    return days + " days ago";
                else
                    return "one day ago";
            }
        },
        ...viewData
    });
}

export async function createViewData(cookies: any): Promise<any> {
    let viewData: any = {};
    
    if (cookies.session) {
        let session = await model.getSessionById(cookies.session);
        if (session && session.userName) {
            let user = await model.getUserByName(session.userName);
            if (user) {
                viewData.userName = user.name;
                viewData.user = user;
                viewData.isAdmin = isAdmin(user.name);
                viewData.notifCount = await model.getNotificationCountByUser(user)
            }
        }
    }
    
    return viewData;
}

export function request(options: any): Promise<{resp: any, body: string}> {
    return new Promise((resolve, reject) => {
        requestLib(options, (err: any, resp: any, body: string) => {
            if (err) reject(err);
            else resolve({resp: resp, body: body})
        });
    });
}

export enum MediaType {
    image = "image",
    video = "video",
    iframe = "iframe"
}

export interface ExternalMedia {
    type: MediaType,
    url: string
}

export function getUrlFromOpenGraph(url: string): Promise<ExternalMedia | undefined> {
    return new Promise((resolve, reject) => {
        requestLib.get(url, (err: any, resp: any, data: string) => {
            if (data) {
                console.log(resp.headers);
                if (resp.headers["content-type"] && resp.headers["content-type"].indexOf("image") != -1) {
                    resolve({ type: MediaType.image
                            , url: url
                            });
                    return;
                }
                
                let videoUrl = "";
                let imageUrl = "";
                let iframeUrl = "";
                
                data.split("<meta")
                    .map(s => s.split("/>")[0])
                    .map(s => {
                        let url: string | undefined = undefined;
                        try {
                            url = s.split('content="')[1].split('"')[0];
                        } catch (e) {}
                        
                        if (url) {
                            if (s.indexOf('property="og:video"') != -1) {
                                videoUrl = url;
                            } else if (s.indexOf('property="og:video:url"') != -1) {
                                // since youtube has 2 og:video:url, which sucks, I take the one that I can embed
                                if (url.indexOf("youtube") == -1 || url.indexOf("embed") != -1)
                                    iframeUrl = url;
                            } else if (s.indexOf('property="og:image"') != -1) {
                                imageUrl = url;
                            }
                        }
                    });
                 
                data.split("<link")
                    .map(s => s.split("/>")[0])
                    .map(s => {
                        let url: string | undefined = undefined;
                        try {
                            url = s.split('href="')[1].split('"')[0];
                        } catch (e) {}
                        
                        if (url) {
                            if (s.indexOf('rel="image_src"') != -1) {
                                imageUrl = url;
                            }
                        }
                    });
                
                if (videoUrl)
                    resolve({ type: MediaType.video
                            , url: videoUrl
                            });
                else if (iframeUrl)
                    resolve({ type: MediaType.iframe
                            , url: iframeUrl
                            });
                else if (imageUrl)
                    resolve({ type: MediaType.image
                            , url: imageUrl
                            });
            } else {
                reject();
            }
        });
    });
}

export function isUrl(str: string): boolean {
    var expression = /^(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$/;
    var regex = new RegExp(expression);
    return !!str.match(regex);
}

export function parseQualifiedName(str: string): {name: string, host: string, isOwn: boolean} {
    let parts = str.split("@");
    
    if (parts.length == 1) {
        return {
            name: str,
            host: host + (port ? ":"+port : ""),
            isOwn: true
        };
    } else {
        return {
            name: parts[0],
            host: parts[1],
            isOwn: parts[1] == serverAddress
        };
    }
}

export function renderQualifiedName(obj: {name: string, host: string}): string {
    return obj.name + "@" + obj.host;
}

export function isAdmin(name: string): boolean {
    return getAdmins().some(e => e == name);
}

export function hashPassword(password: string, salt: string): Promise<string> {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
            if (err)
                reject();
            else
                resolve(derivedKey.toString("hex"));
        });
    });
}

export function renderMarkdown(str: string): string {
    str = str.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;')
             .replace(/'/g, '&apos;');
    
    let converter = new showdown.Converter()
    let html = converter.makeHtml(str);
    return sanitizeHtml(html);
}
let digits64 = //   0       8       16      24      32      40      48      56     63
               //   v       v       v       v       v       v       v       v      v
                   "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_".split("");
let digit64Map: {[key: string]: number} = (function(){
    var digits = digits64;
    var digitsMap: {[key: string]: number}  = {};
    for (var i = 0; i < digits.length; i++) {
        digitsMap[digits[i]] = i;
    }
    
    return digitsMap;
})();

export function intToBase64(int32: number): string {
    let result = "";
    
    while(true) {
        result = digits64[int32 & 0x3f] + result;
        int32 >>>= 6;
        if (int32 == 0)
            break;
    }
    
    return result;
}

export function base64ToInt(digitsStr: string): number {
    let result = 0;
    
    let digits = digitsStr.split("");
    
    for (let i = 0 ; i < digits.length ; i++) {
        result = (result << 6) + digit64Map[digits[i]];
    }
    
    return result;
}
