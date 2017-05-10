import { IncomingMessage } from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as pify from 'pify';
import { IConversionJob } from '../job';
import { IStepDescription, IStepsContext } from './step';

export interface IDownloadAssetsStepsContext extends IStepsContext {
    downloadedAssetsDir: string;
    downloadedAssetsPaths: string[];
}

export function describe(): IStepDescription {
    return {
        code: 'download-assets',
        name: 'Download remote assets',
        priority: 10,
    };
}

export function shouldProcess(job: IConversionJob): boolean {
    return true;
}

export async function process(job: IConversionJob, context: IDownloadAssetsStepsContext): Promise<void> {
    // @TODO add progress report
    //=> Create a temporary folder for the assets
    const tmpDir = path.resolve(`${os.tmpdir()}/chuck-dl-assets-${Date.now()}`);
    await pify(fs.mkdir)(tmpDir);

    //=> Start downloading all assets
    const downloads = job.data.assetUrls.map(url => downloadAndStoreAsset(url, tmpDir));

    //=> Await downloads and store resulting paths in the context
    context.downloadedAssetsDir = tmpDir;
    context.downloadedAssetsPaths = await Promise.all(downloads);
}

export async function cleanup(context: Readonly<IDownloadAssetsStepsContext>): Promise<void> {
    const rms = context.downloadedAssetsPaths.map(path => pify(fs.unlink)(path));

    await Promise.all(rms);
    await pify(fs.rmdir)(context.downloadedAssetsDir);
}

async function downloadAndStoreAsset(assetUrl: string, directory: string): Promise<string> {
    //=> Find the dest path for the asset based on `directory`
    const fileName = assetUrl.split('/').reverse()[0]; // @TODO Trim query strings and anchors
    const filePath = path.resolve(`${directory}/${fileName}`);

    //=> Make HTTP request and create a write stream to the temp asset file
    const onlineAsset = await downloadAsset(assetUrl);
    const localAsset = fs.createWriteStream(filePath);

    //=> Pipe the HTTP response content to the write stream, then resolve
    return new Promise<string>((resolve) => {
        onlineAsset.pipe(localAsset).on('finish', () => {
            localAsset.close();
            resolve(filePath);
        });
    });
}

function downloadAsset(assetUrl: string): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
        https.get(assetUrl, (response) => { // @TODO Support http links!
            if (response.statusCode != 200) {
                reject(new Error(`HTTP error ${response.statusCode} for ${assetUrl}`));
                return;
            }

            resolve(response);
        }).on('error', reject);
    });
}
