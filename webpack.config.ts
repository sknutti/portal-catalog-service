import { ServerlessArtifactWebpackPlugin } from '@dsco/service-utils';
import { resolve } from 'path';
import { TsconfigPathsPlugin } from 'tsconfig-paths-webpack-plugin';
import { Configuration, NormalModuleReplacementPlugin } from 'webpack';

// eslint-disable-next-line @typescript-eslint/no-var-requires
// const { StatsWriterPlugin } = require('webpack-stats-plugin');

process.env.GEARMAN_HOST = 'gearman.test';
process.env.SLS_COGNITO_IDENTITY_ID = 'us-east-1:4f0ca0fa-1dd2-4872-b118-41cb20813329';
process.env.LEO_LOCAL = 'true';

module.exports = async (env?: { local: boolean }): Promise<Configuration> => {
    const isLocal = env?.local;
    const serverlessArtifactPlugin = new ServerlessArtifactWebpackPlugin('./serverless.yml', {
        layersProvidedDependencies: ['leo-sdk', 'leo-streams', 'leo-config']
    });

    return {
        entry: serverlessArtifactPlugin.entry,
        devtool: 'source-map',
        target: 'node',
        mode: isLocal ? 'development' : 'production',
        externals: ['aws-sdk', 'leo-sdk', 'leo-streams', 'leo-config'],
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
                        configFile: 'tsconfig.artifact.json'
                    },
                    exclude: /node_modules/
                }
            ]
        },
        resolve: {
            extensions: ['.ts', '.js', '.tsx'],
            plugins: [
                new TsconfigPathsPlugin({
                    configFile: './tsconfig.json',
                })
            ]
        },
        output: {
            // Filename: "index.js",
            path: resolve(__dirname, 'build/artifact'),
            libraryTarget: 'commonjs'
        },
        plugins: [
            serverlessArtifactPlugin,
            // new StatsWriterPlugin({
            //     stats: {
            //         all: true
            //     }
            // })
        ]
    };
};
