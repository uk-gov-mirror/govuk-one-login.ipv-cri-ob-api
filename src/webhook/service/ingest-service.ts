import type {SQSPublisher} from "@common/client/sqs-client";

export interface IngestServiceCollaborators {
    publisher: SQSPublisher,
    // repository: DeduplicationRepository
}

export const createIngestService = ({ publisher, repository }: IngestServiceCollaborators) => {

}