import { ServerlessArtifactWebpackPlugin } from '@dsco/service-utils';
import { DscoEnv } from '@dsco/ts-models';
import { setupEnvironmentForRunningLocally } from '@lib/environment';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import { resolve } from 'path';
import { TsconfigPathsPlugin } from 'tsconfig-paths-webpack-plugin';
import { Configuration, NormalModuleReplacementPlugin } from 'webpack';
import InjectPlugin from 'webpack-inject-plugin';

// eslint-disable-next-line @typescript-eslint/no-var-requires
// const { StatsWriterPlugin } = require('webpack-stats-plugin');

const stage: DscoEnv = 'test';
setupEnvironmentForRunningLocally(stage);

module.exports = async (env?: { local: boolean }): Promise<Configuration> => {
    const isLocal = env?.local;

    const serverlessArtifactPlugin = new ServerlessArtifactWebpackPlugin('./serverless.yml', {
        layersProvidedDependencies: ['leo-sdk', 'leo-streams', 'leo-config'],
        serverlessOfflineStage: stage,
        /**
         * This warning is expected because of the InjectPlugin beneath.
         */
        suppressEntryWarning: true,
    });

    return {
        entry: serverlessArtifactPlugin.entry,
        devtool: isLocal ? 'cheap-module-eval-source-map' : 'source-map',
        target: 'node',
        mode: isLocal ? 'development' : 'production',
        // aws-sdk is provided by aws, saslprep and mongodb-client-encryption are optional and unused.
        // leo stuff comes from layers.
        externals: ['aws-sdk', 'saslprep', 'mongodb-client-encryption', 'leo-sdk', 'leo-streams', 'leo-config'],
        module: {
            rules: [
                // {
                //     test: /\.tsx?$/,
                //     enforce: 'pre',
                //     use: [
                //         {
                //             loader: 'eslint-loader',
                //             options: {
                //                 emitErrors: true,
                //                 failOnWarnings: !isLocal
                //             }
                //         }
                //     ]
                // },
                {
                    test: /\.tsx?$/,
                    loader: 'ts-loader',
                    options: {
                        configFile: 'tsconfig.artifact.json',
                        transpileOnly: true,
                    },
                    exclude: /node_modules/,
                },
            ],
        },
        resolve: {
            extensions: ['.ts', '.js', '.tsx'],
            // Used to reduce size of sheetjs.  @see https://github.com/SheetJS/sheetjs/issues/694
            alias: { './dist/cpexcel.js': '' },
            plugins: [
                new TsconfigPathsPlugin({
                    configFile: './tsconfig.json',
                }),
            ],
        },
        output: {
            // Filename: "index.js",
            path: resolve(__dirname, 'build/artifact'),
            libraryTarget: 'commonjs',
        },
        plugins: [
            serverlessArtifactPlugin,
            // new StatsWriterPlugin({
            //     stats: {
            //         all: true
            //     }
            // }),
            // Huge kludge, essentially means we don't care about require_optional (used by mongodb).
            new NormalModuleReplacementPlugin(/require_optional/, resolve(__dirname, 'require-optional-kludge.js')),
            new ForkTsCheckerWebpackPlugin(),
            new InjectPlugin(() => 'require("source-map-support").install();'),
        ],
    };
};
