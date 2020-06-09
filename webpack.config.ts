import { ServerlessArtifactWebpackPlugin } from '@dsco/service-utils';
import { resolve } from 'path';
import { Configuration, NormalModuleReplacementPlugin } from 'webpack';

// eslint-disable-next-line @typescript-eslint/no-var-requires
// const { StatsWriterPlugin } = require('webpack-stats-plugin');

process.env.GEARMAN_HOST = 'gearman.test';
process.env.SLS_COGNITO_IDENTITY_ID = 'us-east-1:96a26e06-efc8-4aa1-8efd-df4150d63294';

module.exports = async (env?: { local: boolean }): Promise<Configuration> => {
    const isLocal = env?.local;
    const serverlessArtifactPlugin = new ServerlessArtifactWebpackPlugin('./serverless.yml');

    return {
        entry: serverlessArtifactPlugin.entry,
        devtool: 'source-map',
        target: 'node',
        mode: isLocal ? 'development' : 'production',
        externals: ['aws-sdk'],
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    enforce: 'pre',
                    use: [
                        {
                            loader: 'eslint-loader',
                            options: {
                                emitErrors: true,
                                failOnWarnings: !isLocal
                            }
                        }
                    ]
                },
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
            extensions: ['.ts', '.js', '.tsx']
        },
        output: {
            // Filename: "index.js",
            path: resolve(__dirname, 'build/artifact'),
            libraryTarget: 'commonjs'
        },
        plugins: [
            serverlessArtifactPlugin,
            // Huge kludge, essentially means we don't care about require_optional (used by mongodb).
            new NormalModuleReplacementPlugin(/require_optional/, resolve(__dirname, 'require-optional-kludge.js')),
            // new StatsWriterPlugin({
            //     stats: {
            //         all: true
            //     }
            // })
        ]
    };
};
